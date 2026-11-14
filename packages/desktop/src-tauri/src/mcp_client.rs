//! Externe MCP-client voor de AI-zijbalk (`docs/OCSS_TW_開發需求規格.md`, P2-15).
//!
//! Maakt verbinding met externe MCP-servers over **stdio** (subproces, bijv.
//! `regs_server.py --mcp`, `OpenCADStudio --mcp`, eigen ontwerp-engine) of
//! **HTTP** (JSON-RPC 2.0 / Streamable HTTP, optioneel met `Mcp-Session-Id` en
//! SSE-antwoord). Houdt actieve stdio-processen open zolang de gebruiker niet
//! verbreekt en sluit ze bij afsluiten van de app.
//!
//! Eventuele HTTP Bearer-tokens of sleutels staan alleen in de sleutelbos van
//! het besturingssysteem (`mcp_secret:<server_id>`), nooit in `preferences.json`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::State;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const DIENST: &str = "open-calcsheet-studio-ai";
const STDIO_INIT_TIJD: Duration = Duration::from_secs(20);
const STDIO_CALL_TIJD: Duration = Duration::from_secs(60);
const HTTP_TIJD: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    Stdio,
    Http,
}

#[derive(Debug, Clone, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    #[serde(default)]
    pub naam: String,
    pub transport: McpTransport,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct McpExternTool {
    pub server_id: String,
    pub naam: String,
    pub beschrijving: String,
    pub schema: Value,
    pub read_only: bool,
    pub destructive: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpServerStatus {
    pub id: String,
    pub verbonden: bool,
    pub server_naam: Option<String>,
    pub server_versie: Option<String>,
    pub tools: Vec<McpExternTool>,
    pub fout: Option<String>,
    pub heeft_geheim: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpToolResult {
    pub ok: bool,
    pub tekst: String,
    pub is_error: bool,
    pub raw: Value,
}

fn secret_naam(id: &str) -> String {
    format!("mcp_secret:{id}")
}

fn heeft_geheim(id: &str) -> bool {
    crate::erpnext::lees_geheim(DIENST, &secret_naam(id))
        .ok()
        .flatten()
        .is_some()
}

fn mag_kop(naam: &str, waarde: &str) -> bool {
    let n = naam.trim();
    if n.is_empty() || n.contains(['\r', '\n', ':']) || waarde.contains(['\r', '\n']) {
        return false;
    }
    !matches!(
        n.to_ascii_lowercase().as_str(),
        "host" | "content-length" | "transfer-encoding" | "connection" | "mcp-session-id"
    )
}

// ── Stdio-sessie ─────────────────────────────────────────────────────────────

struct StdioSessie {
    child: Child,
    stdin: ChildStdin,
    inbox: mpsc::Receiver<Value>,
    stderr: Arc<Mutex<VecDeque<String>>>,
    volgende_id: AtomicU64,
}

impl StdioSessie {
    fn start(cfg: &McpServerConfig) -> Result<Self, String> {
        let cmd_str = cfg
            .command
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "MCP stdio: command is required".to_string())?;

        let mut cmd = Command::new(cmd_str);
        cmd.args(&cfg.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(cwd) = cfg.cwd.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            cmd.current_dir(cwd);
        }
        if !cfg.env.is_empty() {
            cmd.envs(&cfg.env);
        }
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start MCP server `{cmd_str}`: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture MCP server stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture MCP server stdout".to_string())?;
        let stderr_pipe = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture MCP server stderr".to_string())?;

        let (tx, rx) = mpsc::channel::<Value>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(l) = line else { break };
                let t = l.trim();
                if t.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<Value>(t) {
                    if tx.send(val).is_err() {
                        break;
                    }
                }
            }
        });

        let stderr_buf = Arc::new(Mutex::new(VecDeque::with_capacity(12)));
        let stderr_clone = stderr_buf.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr_pipe);
            for line in reader.lines() {
                let Ok(l) = line else { break };
                let t = l.trim();
                if t.is_empty() {
                    continue;
                }
                if let Ok(mut buf) = stderr_clone.lock() {
                    if buf.len() >= 10 {
                        buf.pop_front();
                    }
                    buf.push_back(t.to_string());
                }
            }
        });

        Ok(Self {
            child,
            stdin,
            inbox: rx,
            stderr: stderr_buf,
            volgende_id: AtomicU64::new(1),
        })
    }

    fn stderr_staart(&self) -> String {
        let Ok(buf) = self.stderr.lock() else {
            return String::new();
        };
        if buf.is_empty() {
            return String::new();
        }
        format!(" | stderr: {}", buf.iter().cloned().collect::<Vec<_>>().join(" / "))
    }

    fn vraag(&mut self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        if let Ok(Some(status)) = self.child.try_wait() {
            return Err(format!(
                "MCP server exited ({status}){}",
                self.stderr_staart()
            ));
        }
        let id = self.volgende_id.fetch_add(1, Ordering::Relaxed);
        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let lijn = format!("{msg}\n");
        self.stdin
            .write_all(lijn.as_bytes())
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("Failed writing to MCP server: {e}{}", self.stderr_staart()))?;

        let deadline = Instant::now() + timeout;
        loop {
            let rest = deadline.saturating_duration_since(Instant::now());
            if rest.is_zero() {
                return Err(format!(
                    "MCP `{method}` timed out after {} s{}",
                    timeout.as_secs(),
                    self.stderr_staart()
                ));
            }
            match self.inbox.recv_timeout(rest.min(Duration::from_millis(250))) {
                Ok(val) => {
                    if val.get("id").and_then(|v| v.as_u64()) == Some(id) {
                        if let Some(err) = val.get("error") {
                            let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
                            let msg = err
                                .get("message")
                                .and_then(|m| m.as_str())
                                .unwrap_or("unknown error");
                            return Err(format!("MCP error {code}: {msg}"));
                        }
                        return Ok(val.get("result").cloned().unwrap_or(Value::Null));
                    }
                    // Overige notificaties negeren en doorwachten op het antwoord met ons id.
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let Ok(Some(status)) = self.child.try_wait() {
                        return Err(format!(
                            "MCP server exited during `{method}` ({status}){}",
                            self.stderr_staart()
                        ));
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(format!(
                        "MCP server closed stdout during `{method}`{}",
                        self.stderr_staart()
                    ));
                }
            }
        }
    }

    fn meld(&mut self, method: &str, params: Value) -> Result<(), String> {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let lijn = format!("{msg}\n");
        self.stdin
            .write_all(lijn.as_bytes())
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("Failed sending notification `{method}`: {e}"))
    }

    fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for StdioSessie {
    fn drop(&mut self) {
        self.stop();
    }
}

// ── HTTP-sessie (JSON-RPC 2.0 / Streamable HTTP) ─────────────────────────────

struct HttpSessie {
    id: String,
    url: String,
    headers: HashMap<String, String>,
    session_id: Option<String>,
    agent: ureq::Agent,
    volgende_id: AtomicU64,
}

impl HttpSessie {
    fn nieuw(cfg: &McpServerConfig) -> Result<Self, String> {
        let raw_url = cfg
            .url
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "MCP HTTP: url is required".to_string())?;
        let parsed = url::Url::parse(raw_url).map_err(|e| format!("Invalid MCP URL: {e}"))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err("MCP URL must start with http:// or https://".to_string());
        }
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(10))
            .timeout(HTTP_TIJD)
            .build();
        Ok(Self {
            id: cfg.id.clone(),
            url: raw_url.to_string(),
            headers: cfg.headers.clone(),
            session_id: None,
            agent,
            volgende_id: AtomicU64::new(1),
        })
    }

    fn bouw_verzoek(&self) -> Result<ureq::Request, String> {
        let mut req = self
            .agent
            .post(&self.url)
            .set("Content-Type", "application/json")
            .set("Accept", "application/json, text/event-stream");
        let mut heeft_auth = false;
        for (k, v) in &self.headers {
            if mag_kop(k, v) {
                if k.eq_ignore_ascii_case("authorization") {
                    heeft_auth = true;
                }
                req = req.set(k.trim(), v.trim());
            }
        }
        if !heeft_auth {
            if let Some(secret) = crate::erpnext::lees_geheim(DIENST, &secret_naam(&self.id))? {
                let s = secret.trim();
                if !s.is_empty() {
                    let waarde = if s.to_ascii_lowercase().starts_with("bearer ") {
                        s.to_string()
                    } else {
                        format!("Bearer {s}")
                    };
                    req = req.set("Authorization", &waarde);
                }
            }
        }
        if let Some(sid) = &self.session_id {
            req = req.set("Mcp-Session-Id", sid);
        }
        Ok(req)
    }

    fn vraag(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.volgende_id.fetch_add(1, Ordering::Relaxed);
        let body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let req = self.bouw_verzoek()?;
        let resp = match req.send_json(body) {
            Ok(r) => r,
            Err(ureq::Error::Status(code, r)) => {
                let txt = r.into_string().unwrap_or_default();
                let kort: String = txt.chars().take(240).collect();
                return Err(format!("MCP HTTP {code}: {kort}"));
            }
            Err(e) => return Err(format!("MCP HTTP request failed: {e}")),
        };
        if let Some(sid) = resp.header("mcp-session-id") {
            let trimmed = sid.trim();
            if !trimmed.is_empty() {
                self.session_id = Some(trimmed.to_string());
            }
        }
        let ct = resp
            .header("content-type")
            .unwrap_or("")
            .to_ascii_lowercase();
        let tekst = resp
            .into_string()
            .map_err(|e| format!("Failed reading MCP HTTP body: {e}"))?;

        let msg = if ct.contains("text/event-stream") || tekst.trim_start().starts_with("data:") || tekst.trim_start().starts_with("event:") {
            parse_sse_jsonrpc(&tekst, id)?
        } else {
            serde_json::from_str::<Value>(&tekst)
                .map_err(|e| format!("Invalid JSON from MCP HTTP server: {e}"))?
        };
        if let Some(err) = msg.get("error") {
            let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            let m = err
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("unknown error");
            return Err(format!("MCP error {code}: {m}"));
        }
        Ok(msg.get("result").cloned().unwrap_or(Value::Null))
    }

    fn meld(&mut self, method: &str, params: Value) -> Result<(), String> {
        let body = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let req = self.bouw_verzoek()?;
        match req.send_json(body) {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(code, _)) if code == 202 || code == 204 => Ok(()),
            Err(ureq::Error::Status(code, r)) => {
                let txt = r.into_string().unwrap_or_default();
                let kort: String = txt.chars().take(200).collect();
                Err(format!("MCP HTTP notification {code}: {kort}"))
            }
            Err(e) => Err(format!("MCP HTTP notification failed: {e}")),
        }
    }
}

/// Haalt het JSON-RPC-antwoord met `expected_id` uit een `text/event-stream` HTTP-body.
fn parse_sse_jsonrpc(body: &str, expected_id: u64) -> Result<Value, String> {
    let mut data_regels: Vec<&str> = Vec::new();
    let mut eerste_antwoord: Option<Value> = None;

    let verwerk_blok = |regels: &mut Vec<&str>, eerste: &mut Option<Value>| -> Option<Value> {
        if regels.is_empty() {
            return None;
        }
        let samengevoegd = regels.join("\n");
        regels.clear();
        let Ok(val) = serde_json::from_str::<Value>(samengevoegd.trim()) else {
            return None;
        };
        if val.get("id").and_then(|v| v.as_u64()) == Some(expected_id) {
            return Some(val);
        }
        if eerste.is_none() && (val.get("result").is_some() || val.get("error").is_some()) {
            *eerste = Some(val);
        }
        None
    };

    for raw in body.lines() {
        let line = raw.trim_end_matches('\r');
        if line.is_empty() {
            if let Some(gevonden) = verwerk_blok(&mut data_regels, &mut eerste_antwoord) {
                return Ok(gevonden);
            }
        } else if let Some(rest) = line.strip_prefix("data:") {
            data_regels.push(rest.strip_prefix(' ').unwrap_or(rest));
        }
    }
    if let Some(gevonden) = verwerk_blok(&mut data_regels, &mut eerste_antwoord) {
        return Ok(gevonden);
    }
    eerste_antwoord.ok_or_else(|| "No matching JSON-RPC payload in MCP SSE response".to_string())
}

// ── Gedeeld protocol (handshake, tools/list, tools/call) ───────────────────

enum Verbinding {
    Stdio(StdioSessie),
    Http(HttpSessie),
}

impl Verbinding {
    fn vraag(&mut self, method: &str, params: Value, stdio_timeout: Duration) -> Result<Value, String> {
        match self {
            Self::Stdio(s) => s.vraag(method, params, stdio_timeout),
            Self::Http(h) => h.vraag(method, params),
        }
    }

    fn meld(&mut self, method: &str, params: Value) -> Result<(), String> {
        match self {
            Self::Stdio(s) => s.meld(method, params),
            Self::Http(h) => h.meld(method, params),
        }
    }
}

struct ActieveServer {
    naam: String,
    server_naam: Option<String>,
    server_versie: Option<String>,
    tools: Vec<McpExternTool>,
    verbinding: Verbinding,
}

pub struct McpClientState {
    servers: Arc<Mutex<HashMap<String, ActieveServer>>>,
}

impl Default for McpClientState {
    fn default() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl McpClientState {
    pub fn stop_all(&self) {
        if let Ok(mut map) = self.servers.lock() {
            map.clear();
        }
    }
}

fn parse_tools_lijst(server_id: &str, result: &Value) -> (Vec<McpExternTool>, Option<String>) {
    let lijst = result
        .get("tools")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let tools = lijst
        .into_iter()
        .filter_map(|item| {
            let naam = item.get("name")?.as_str()?.trim().to_string();
            if naam.is_empty() {
                return None;
            }
            let beschrijving = item
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string();
            let schema = item
                .get("inputSchema")
                .cloned()
                .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
            let ann = item.get("annotations");
            let read_only = ann
                .and_then(|a| a.get("readOnlyHint"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let destructive = ann
                .and_then(|a| a.get("destructiveHint"))
                .and_then(|v| v.as_bool())
                .unwrap_or(!read_only);
            Some(McpExternTool {
                server_id: server_id.to_string(),
                naam,
                beschrijving,
                schema,
                read_only,
                destructive,
            })
        })
        .collect();
    let next_cursor = result
        .get("nextCursor")
        .and_then(|c| c.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    (tools, next_cursor)
}

fn format_tool_uitkomst(result: Value) -> McpToolResult {
    let is_error = result
        .get("isError")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let mut delen: Vec<String> = Vec::new();
    if let Some(arr) = result.get("content").and_then(|v| v.as_array()) {
        for item in arr {
            let soort = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match soort {
                "text" => {
                    if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                        delen.push(t.to_string());
                    }
                }
                "resource" => {
                    if let Some(res) = item.get("resource") {
                        if let Some(t) = res.get("text").and_then(|v| v.as_str()) {
                            delen.push(t.to_string());
                        } else if let Some(u) = res.get("uri").and_then(|v| v.as_str()) {
                            delen.push(format!("[resource: {u}]"));
                        }
                    }
                }
                _ => delen.push(item.to_string()),
            }
        }
    }
    let tekst = if !delen.is_empty() {
        delen.join("\n")
    } else if let Some(sc) = result.get("structuredContent") {
        sc.to_string()
    } else {
        result.to_string()
    };
    McpToolResult {
        ok: !is_error,
        tekst,
        is_error,
        raw: result,
    }
}

fn maak_verbinding(cfg: &McpServerConfig) -> Result<ActieveServer, String> {
    let mut verb = match cfg.transport {
        McpTransport::Stdio => Verbinding::Stdio(StdioSessie::start(cfg)?),
        McpTransport::Http => Verbinding::Http(HttpSessie::nieuw(cfg)?),
    };

    let init = verb.vraag(
        "initialize",
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "open-calcsheet-studio",
                "version": env!("CARGO_PKG_VERSION"),
            }
        }),
        STDIO_INIT_TIJD,
    )?;

    let server_naam = init
        .get("serverInfo")
        .and_then(|i| i.get("name"))
        .and_then(|n| n.as_str())
        .map(str::to_string);
    let server_versie = init
        .get("serverInfo")
        .and_then(|i| i.get("version"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let _ = verb.meld("notifications/initialized", json!({}));

    let mut tools: Vec<McpExternTool> = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..20 {
        let params = match &cursor {
            Some(c) => json!({ "cursor": c }),
            None => json!({}),
        };
        let lijst_res = verb.vraag("tools/list", params, STDIO_INIT_TIJD)?;
        let (mut pagina, volgende) = parse_tools_lijst(&cfg.id, &lijst_res);
        tools.append(&mut pagina);
        match volgende {
            Some(c) => cursor = Some(c),
            None => break,
        }
    }

    Ok(ActieveServer {
        naam: if cfg.naam.trim().is_empty() {
            cfg.id.clone()
        } else {
            cfg.naam.clone()
        },
        server_naam,
        server_versie,
        tools,
        verbinding: verb,
    })
}

fn status_van(id: &str, server: Option<&ActieveServer>, fout: Option<String>) -> McpServerStatus {
    match server {
        Some(s) => McpServerStatus {
            id: id.to_string(),
            verbonden: true,
            server_naam: s.server_naam.clone().or_else(|| Some(s.naam.clone())),
            server_versie: s.server_versie.clone(),
            tools: s.tools.clone(),
            fout,
            heeft_geheim: heeft_geheim(id),
        },
        None => McpServerStatus {
            id: id.to_string(),
            verbonden: false,
            server_naam: None,
            server_versie: None,
            tools: Vec::new(),
            fout,
            heeft_geheim: heeft_geheim(id),
        },
    }
}

// ── Tauri-commando's ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mcp_extern_connect(
    config: McpServerConfig,
    state: State<'_, McpClientState>,
) -> Result<McpServerStatus, String> {
    let id = config.id.trim().to_string();
    if id.is_empty() {
        return Err("MCP server id is required".to_string());
    }
    let servers = state.servers.clone();
    // Verwijder eventuele oude sessie eerst zodat hetzelfde proces/poort vrijkomt.
    if let Ok(mut map) = servers.lock() {
        map.remove(&id);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cfg = config;
        cfg.id = id.clone();
        let actief = maak_verbinding(&cfg)?;
        let st = status_van(&id, Some(&actief), None);
        let mut map = servers
            .lock()
            .map_err(|_| "MCP client state lock poisoned".to_string())?;
        map.insert(id, actief);
        Ok(st)
    })
    .await
    .map_err(|e| format!("MCP connect task failed: {e}"))?
}

#[tauri::command]
pub fn mcp_extern_disconnect(
    id: String,
    state: State<'_, McpClientState>,
) -> Result<McpServerStatus, String> {
    let clean = id.trim().to_string();
    let mut map = state
        .servers
        .lock()
        .map_err(|_| "MCP client state lock poisoned".to_string())?;
    map.remove(&clean);
    Ok(status_van(&clean, None, None))
}

#[tauri::command]
pub fn mcp_extern_status(
    id: String,
    state: State<'_, McpClientState>,
) -> Result<McpServerStatus, String> {
    let clean = id.trim().to_string();
    let map = state
        .servers
        .lock()
        .map_err(|_| "MCP client state lock poisoned".to_string())?;
    Ok(status_van(&clean, map.get(&clean), None))
}

#[tauri::command]
pub async fn mcp_extern_call(
    id: String,
    tool: String,
    arguments: Value,
    state: State<'_, McpClientState>,
) -> Result<McpToolResult, String> {
    let clean = id.trim().to_string();
    let servers = state.servers.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut map = servers
            .lock()
            .map_err(|_| "MCP client state lock poisoned".to_string())?;
        let srv = map
            .get_mut(&clean)
            .ok_or_else(|| format!("MCP server `{clean}` is not connected"))?;
        let args = if arguments.is_object() {
            arguments
        } else {
            json!({})
        };
        let res = srv.verbinding.vraag(
            "tools/call",
            json!({
                "name": tool,
                "arguments": args,
            }),
            STDIO_CALL_TIJD,
        )?;
        Ok(format_tool_uitkomst(res))
    })
    .await
    .map_err(|e| format!("MCP call task failed: {e}"))?
}

#[tauri::command]
pub fn mcp_extern_set_secret(id: String, secret: String) -> Result<bool, String> {
    let clean = id.trim();
    if clean.is_empty() {
        return Err("MCP server id is required".to_string());
    }
    crate::erpnext::bewaar_geheim(DIENST, &secret_naam(clean), &secret)?;
    Ok(!secret.trim().is_empty())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_jsonrpc_kiest_passend_id() {
        let body = concat!(
            "event: message\n",
            "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{\"p\":1}}\n\n",
            "event: message\n",
            "data: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{\"tools\":[{\"name\":\"regs_ask\"}]}}\n\n",
        );
        let v = parse_sse_jsonrpc(body, 7).unwrap();
        assert_eq!(v["id"], 7);
        assert_eq!(v["result"]["tools"][0]["name"], "regs_ask");
    }

    #[test]
    fn tools_lijst_leest_annotaties_veilig() {
        let raw = json!({
            "tools": [
                {
                    "name": "regs_ask",
                    "description": "Query code",
                    "inputSchema": {"type": "object"},
                    "annotations": {"readOnlyHint": true, "destructiveHint": false}
                },
                {
                    "name": "cad_draw",
                    "description": "Draw DXF",
                    "inputSchema": {"type": "object"}
                }
            ],
            "nextCursor": "p2"
        });
        let (tools, cursor) = parse_tools_lijst("regs", &raw);
        assert_eq!(cursor.as_deref(), Some("p2"));
        assert_eq!(tools.len(), 2);
        assert!(tools[0].read_only);
        assert!(!tools[0].destructive);
        assert!(!tools[1].read_only);
        assert!(tools[1].destructive);
    }

    #[test]
    fn tool_uitkomst_pakt_tekst_en_isfout() {
        let ok = format_tool_uitkomst(json!({
            "content": [{"type": "text", "text": "rc112 22.2"}, {"type": "text", "text": "p.45"}],
            "isError": false
        }));
        assert!(ok.ok);
        assert!(!ok.is_error);
        assert_eq!(ok.tekst, "rc112 22.2\np.45");

        let err = format_tool_uitkomst(json!({
            "content": [{"type": "text", "text": "not found"}],
            "isError": true
        }));
        assert!(!err.ok);
        assert!(err.is_error);
        assert_eq!(err.tekst, "not found");
    }

    #[test]
    fn mag_kop_blokkeert_gevaarlijke_koppen() {
        assert!(mag_kop("X-Custom", "123"));
        assert!(!mag_kop("Host", "evil.local"));
        assert!(!mag_kop("Mcp-Session-Id", "abc"));
        assert!(!mag_kop("X-Bad", "a\r\nb"));
    }
}
