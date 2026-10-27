// dsh-system-notify settings page.
//
// Loaded by the Harness Web shell as a dynamic client module. Registers one
// `settings.section` page; all state lives on the host at
// <config dir>/config.json and is read/written through the plugin's two
// same-origin routes (/dsh-system-notify/config and /test).
window.__ModuleLoader__.load({ id: "dsh-system-notify", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  var React = require("react");
  var h = React.createElement;

  var SECTION_ID = "dsh-system-notify";
  var SLOT = "settings.section";

  var ZH = {
    title: "系统通知",
    intro: "任务完成、出错、需要输入或目标完成时，弹出系统通知并播放提示音。类似 Codex 的完成提醒，但事件、音效、风格和隐私级别都可配置。",
    loading: "加载中…",
    save: "保存",
    saved: "已保存",
    testToast: "发送测试通知",
    testSound: "试听音效",
    reset: "恢复默认",
    reload: "重新加载",
    resetDone: "已填入默认值，点击“保存”后生效。",
    saveFailed: "保存失败",
    testFailed: "测试失败",
    testing: "正在发送…",
    saving: "保存中…",
    events: "通知事件",
    eventsHint: "勾选哪些状态需要提醒。",
    style: "通知风格",
    styleHint: "隐私级别与信息量逐级增加。",
    sound: "音效",
    soundHint: "Windows 使用系统提示音或 WAV 文件；Ubuntu 使用 paplay / pw-play。",
    soundEnabled: "播放提示音",
    normalSound: "普通事件音效",
    errorSound: "错误事件音效",
    customPath: "自定义音频文件",
    customPathHint: "Windows 需 WAV；Ubuntu 支持 WAV/OGG。留空则使用内置音效。",
    volume: "音量",
    volumeHint: "仅 Ubuntu（paplay / pw-play）生效。",
    delivery: "通知方式",
    deliveryHint: "“仅音效”适合全屏工作时只要提示音。",
    quiet: "免打扰时段",
    quietEnabled: "启用免打扰",
    quietStart: "开始",
    quietEnd: "结束",
    allowCritical: "错误、目标受阻及需要处理的阻塞提示仍然提醒",
    filters: "频率限制",
    minDuration: "最短任务时长（秒）",
    minDurationHint: "仅对“任务完成”生效；0 表示不限制。",
    cooldown: "同类通知冷却（秒）",
    cooldownHint: "避免连续通知刷屏；严重错误不受限。",
    ignoreSubagent: "忽略子代理会话的轮次通知",
    include: "通知内容",
    includeSession: "会话名",
    includeSummary: "摘要 / 问题 / 错误信息",
    includeWorkspace: "项目名 / 路径",
    includeDuration: "耗时",
    includeSessionId: "会话 ID",
    summaryChars: "摘要最大字数",
    click: "点击通知",
    clickEnabled: "点击通知时唤起 DSH 窗口",
    clickUrl: "点击打开的链接",
    clickUrlHint: "支持 dsh:// 或 http(s)://。默认使用 DSH 桌面版的 dsh://open 深链；网页版可改为 DSH 的 http 地址。",
    clickTitle: "Ubuntu 窗口标题匹配",
    clickTitleHint: "Ubuntu 上先尝试用 wmctrl/xdotool 按该标题聚焦窗口，找不到再打开上面的链接。",
    clickFallback: "找不到窗口时改为打开链接",
    agentTool: "允许 Agent 主动发送通知",
    agentToolHint: "注册工具 send_desktop_notification，Agent 可随时提醒你。",
    advanced: "高级",
    language: "通知语言",
    languageAuto: "跟随系统",
    appName: "通知应用名（Linux）",
    appId: "Windows Toast AppID",
    appIdHint: "默认 com.deepseek.dsh（DSH 桌面版快捷方式注册）。不存在时会自动回退到其他已注册 Toast 源，一般无需修改。",
    iconPath: "自定义通知图标（PNG）",
    iconPathHint: "留空使用插件自带图标。",
    configPath: "配置文件",
    backend: "当前后端",
    toast: "系统通知",
    soundBackend: "音效",
    clickBackend: "点击唤起",
    on: "可用",
    off: "不可用",
    notes: "环境提示",
    loadError: "配置读取失败，已使用默认值：",
    enabled: "已启用",
    disabled: "已停用",
    eventLabels: {
      turnComplete: ["任务完成", "一轮回复正常结束"],
      turnError: ["任务出错", "模型或工具报错"],
      turnBlocked: ["任务受阻", "轮次被阻塞，例如等待确认"],
      turnMaxTokens: ["输出被截断", "达到最大输出长度"],
      turnAborted: ["任务取消", "手动取消或中断（默认关闭）"],
      needsInput: ["需要你的输入", "ask_user_question 正在等待回答"],
      approvalRequest: ["需要你的批准", "工具调用等待审批"],
      goalComplete: ["目标完成", "长期目标标记为完成"],
      goalBlocked: ["目标受阻", "长期目标被阻塞"],
      subagentComplete: ["子任务完成", "子代理结束（默认关闭）"],
      workflowComplete: ["工作流完成", "多代理工作流结束（默认关闭）"]
    },
    styleLabels: {
      privacy: ["隐私", "只显示事件类型，不含会话名、摘要、路径或错误详情。"],
      simple: ["简洁", "事件类型 + 会话名（没有会话名时显示项目名）。"],
      standard: ["标准", "会话名、摘要、项目名与耗时。"],
      detailed: ["详细", "摘要、完整路径、会话 ID、轮次与错误码。"]
    },
    soundLabels: {
      none: "静音",
      system: "系统默认",
      chime: "清脆提示音",
      alert: "警示音",
      custom: "自定义文件"
    },
    deliveryLabels: {
      both: "通知 + 音效",
      toast: "仅通知",
      sound: "仅音效"
    },
    languageLabels: { auto: "跟随系统", zh: "中文", en: "English" },
    notesMap: {
      "click.requiresDshDesktop": "Windows 的点击唤起使用 DSH 桌面版注册的 dsh://open 协议；若使用网页版，请把点击链接改为 DSH 地址。",
      "windows.powershellMissing": "未找到 powershell.exe，无法发送 Windows 通知。",
      "linux.libnotifyMissing": "未找到 notify-send / gdbus。Ubuntu 请安装：sudo apt install libnotify-bin",
      "linux.soundPlayerMissing": "未找到音频播放器。Ubuntu 请安装：sudo apt install pulseaudio-utils",
      "linux.clickRequiresGdbus": "点击唤起需要 gdbus 与 dbus-monitor。Ubuntu 请安装：sudo apt install libglib2.0-bin",
      "linux.dbusMonitorMissing": "未找到 dbus-monitor，点击唤起不可用。Ubuntu 请安装：sudo apt install libglib2.0-bin",
      "linux.focusHelperMissing": "未找到 wmctrl/xdotool，点击将回退为打开链接；建议：sudo apt install wmctrl",
      "mac.clickNeedsTerminalNotifier": "macOS 点击唤起需要 terminal-notifier：brew install terminal-notifier",
      "platform.unsupported": "当前平台不受支持，仅会记录通知事件。"
    }
  };

  var EN = {
    title: "System Notifications",
    intro: "Desktop toasts and sounds when a task completes, fails, needs input or a goal finishes. Codex-style completion alerts, with configurable events, sound, style and privacy.",
    loading: "Loading…",
    save: "Save",
    saved: "Saved",
    testToast: "Send test notification",
    testSound: "Preview sound",
    reset: "Restore defaults",
    reload: "Reload",
    resetDone: "Defaults loaded. Click Save to apply.",
    saveFailed: "Save failed",
    testFailed: "Test failed",
    testing: "Sending…",
    saving: "Saving…",
    events: "Events",
    eventsHint: "Choose which states raise a notification.",
    style: "Notification style",
    styleHint: "Privacy level and information content increase from left to right.",
    sound: "Sound",
    soundHint: "Windows uses system sounds or a WAV file; Ubuntu uses paplay / pw-play.",
    soundEnabled: "Play a sound",
    normalSound: "Normal event sound",
    errorSound: "Error event sound",
    customPath: "Custom audio file",
    customPathHint: "WAV on Windows; WAV/OGG on Ubuntu. Empty uses bundled sounds.",
    volume: "Volume",
    volumeHint: "Ubuntu only (paplay / pw-play).",
    delivery: "Delivery",
    deliveryHint: "Use sound-only when you are in a full-screen call or focus mode.",
    quiet: "Quiet hours",
    quietEnabled: "Enable quiet hours",
    quietStart: "Start",
    quietEnd: "End",
    allowCritical: "Still notify for errors, blocked goals and blocking prompts",
    filters: "Rate limits",
    minDuration: "Minimum task duration (sec)",
    minDurationHint: "Applies to successful completion only; 0 disables the limit.",
    cooldown: "Cooldown per event (sec)",
    cooldownHint: "Prevents notification spam; critical errors bypass it.",
    ignoreSubagent: "Ignore turn notifications from subagent sessions",
    include: "Content",
    includeSession: "Session title",
    includeSummary: "Summary / question / error",
    includeWorkspace: "Project name / path",
    includeDuration: "Duration",
    includeSessionId: "Session ID",
    summaryChars: "Max summary characters",
    click: "Click action",
    clickEnabled: "Focus the DSH window when the notification is clicked",
    clickUrl: "Link to open on click",
    clickUrlHint: "Supports dsh:// or http(s)://. Defaults to the DSH desktop dsh://open deep link; for the web version use the DSH http URL.",
    clickTitle: "Ubuntu window title match",
    clickTitleHint: "On Ubuntu, try focusing a window with this title through wmctrl/xdotool before opening the link.",
    clickFallback: "Open the link when no window is found",
    agentTool: "Allow the Agent to send notifications",
    agentToolHint: "Registers the send_desktop_notification tool so the model can ping you explicitly.",
    advanced: "Advanced",
    language: "Notification language",
    languageAuto: "Follow system",
    appName: "Notification app name (Linux)",
    appId: "Windows Toast AppID",
    appIdHint: "Defaults to com.deepseek.dsh (registered by the DSH Desktop shortcut). Missing IDs fall back to other registered toast sources; usually leave unchanged.",
    iconPath: "Custom notification icon (PNG)",
    iconPathHint: "Empty uses the plugin's bundled icon.",
    configPath: "Config file",
    backend: "Detected backends",
    toast: "Toast",
    soundBackend: "Sound",
    clickBackend: "Click",
    on: "available",
    off: "unavailable",
    notes: "Environment notes",
    loadError: "Config could not be read; defaults are in use:",
    enabled: "Enabled",
    disabled: "Disabled",
    eventLabels: {
      turnComplete: ["Task completed", "A normal reply finished"],
      turnError: ["Task failed", "The model or a tool reported an error"],
      turnBlocked: ["Task blocked", "The turn is blocked, e.g. waiting for confirmation"],
      turnMaxTokens: ["Output truncated", "Maximum output length reached"],
      turnAborted: ["Task cancelled", "Manually cancelled or interrupted (off by default)"],
      needsInput: ["Input needed", "ask_user_question is waiting for an answer"],
      approvalRequest: ["Approval needed", "A tool call is waiting for approval"],
      goalComplete: ["Goal completed", "A long-running goal is marked complete"],
      goalBlocked: ["Goal blocked", "A goal is blocked"],
      subagentComplete: ["Subagent finished", "A subagent run ended (off by default)"],
      workflowComplete: ["Workflow finished", "A multi-agent workflow ended (off by default)"]
    },
    styleLabels: {
      privacy: ["Privacy", "Event type only: no session title, summary, path or error details."],
      simple: ["Simple", "Event type + session title (workspace name when untitled)."],
      standard: ["Standard", "Session title, summary, project name and duration."],
      detailed: ["Detailed", "Summary, full path, session ID, turn number and error code."]
    },
    soundLabels: {
      none: "Silent",
      system: "System default",
      chime: "Chime",
      alert: "Alert",
      custom: "Custom file"
    },
    deliveryLabels: {
      both: "Toast + sound",
      toast: "Toast only",
      sound: "Sound only"
    },
    languageLabels: { auto: "Follow system", zh: "中文", en: "English" },
    notesMap: {
      "click.requiresDshDesktop": "Click-to-focus uses the dsh://open protocol registered by DSH Desktop. For the web version, point the click link at the DSH URL.",
      "windows.powershellMissing": "powershell.exe was not found; Windows notifications are unavailable.",
      "linux.libnotifyMissing": "notify-send / gdbus was not found. On Ubuntu install: sudo apt install libnotify-bin",
      "linux.soundPlayerMissing": "No sound player found. On Ubuntu install: sudo apt install pulseaudio-utils",
      "linux.clickRequiresGdbus": "Click actions need gdbus and dbus-monitor. On Ubuntu install: sudo apt install libglib2.0-bin",
      "linux.dbusMonitorMissing": "dbus-monitor was not found; click actions are unavailable. Install: sudo apt install libglib2.0-bin",
      "linux.focusHelperMissing": "wmctrl/xdotool not found; click falls back to opening the link. Suggested: sudo apt install wmctrl",
      "mac.clickNeedsTerminalNotifier": "macOS click actions need terminal-notifier: brew install terminal-notifier",
      "platform.unsupported": "Unsupported platform; events will only be logged."
    }
  };

  var LANG = (function () {
    try {
      var nav = String(navigator.language || navigator.userLanguage || "");
      if (nav.toLowerCase().indexOf("zh") === 0) return "zh";
    } catch (e) {}
    return "en";
  })();
  var T = LANG === "zh" ? ZH : EN;

  function tr(key) { return T[key] !== undefined ? T[key] : key; }
  function eventLabel(key) { return T.eventLabels[key] || [key, ""]; }
  function styleLabel(key) { return T.styleLabels[key] || [key, ""]; }

  var S = {
    page: { display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px", paddingBottom: "24px" },
    header: { display: "flex", flexDirection: "column", gap: "6px" },
    h1: { margin: 0, fontSize: "18px", fontWeight: 600 },
    intro: { margin: 0, fontSize: "13px", lineHeight: 1.65, opacity: 0.75 },
    section: {
      display: "flex", flexDirection: "column", gap: "10px", padding: "14px 16px",
      borderRadius: "12px", border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-bg-layer-3)"
    },
    sectionTitle: { margin: 0, fontSize: "14px", fontWeight: 600 },
    sectionHint: { margin: 0, fontSize: "12px", lineHeight: 1.55, opacity: 0.65 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "8px 18px" },
    checkRow: { display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px", lineHeight: 1.45 },
    checkText: { display: "flex", flexDirection: "column", gap: "2px" },
    checkHint: { fontSize: "11px", opacity: 0.6 },
    row: { display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
    label: { fontSize: "13px", fontWeight: 500 },
    hint: { fontSize: "11px", lineHeight: 1.5, opacity: 0.6 },
    input: {
      boxSizing: "border-box", height: 32, borderRadius: "8px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)",
      padding: "0 10px", fontSize: "12px", minWidth: "180px"
    },
    inputWide: { width: "100%", minWidth: 0 },
    number: { width: "90px", minWidth: 0 },
    textarea: {
      boxSizing: "border-box", width: "100%", minHeight: 60, borderRadius: "8px",
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)",
      padding: "6px 10px", fontSize: "12px", resize: "vertical"
    },
    styleGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" },
    styleCard: {
      display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px",
      borderRadius: "10px", border: "1px solid var(--dsw-alias-border-l2)", cursor: "pointer"
    },
    styleCardActive: { borderColor: "#3b82f6", boxShadow: "0 0 0 1px #3b82f6 inset" },
    styleName: { fontSize: "13px", fontWeight: 600 },
    styleDesc: { fontSize: "11px", lineHeight: 1.45, opacity: 0.65 },
    stylePreview: {
      marginTop: "2px", padding: "6px 8px", borderRadius: "6px",
      background: "rgba(127,127,127,0.08)", fontSize: "11px", lineHeight: 1.35,
      whiteSpace: "pre-wrap", wordBreak: "break-word", opacity: 0.9
    },
    actions: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
    btn: {
      padding: "7px 16px", borderRadius: "7px", border: "none", cursor: "pointer",
      fontSize: "12px", fontWeight: 600, color: "#fff", background: "#3b82f6"
    },
    btnGhost: { background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.45)" },
    badge: {
      display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 8px",
      borderRadius: "999px", fontSize: "11px", border: "1px solid var(--dsw-alias-border-l2)"
    },
    dotOn: { width: 7, height: 7, borderRadius: "50%", background: "#22c55e" },
    dotOff: { width: 7, height: 7, borderRadius: "50%", background: "#ef4444" },
    status: { fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap", minHeight: "18px" },
    mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: "11px", wordBreak: "break-all" },
    noteList: { margin: 0, paddingLeft: "18px", fontSize: "11px", lineHeight: 1.55, opacity: 0.75 }
  };

  function clone(value) {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function setPath(object, path, value) {
    var keys = path.split(".");
    var next = clone(object);
    var cursor = next;
    for (var i = 0; i < keys.length - 1; i += 1) {
      var key = keys[i];
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
      cursor[key] = clone(cursor[key]);
      cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
    return next;
  }

  function Section(props) {
    return h("section", { style: S.section },
      h("div", null,
        h("h2", { style: S.sectionTitle }, props.title),
        props.hint ? h("p", { style: S.sectionHint }, props.hint) : null),
      props.children);
  }

  function Check(props) {
    return h("label", { style: S.checkRow },
      h("input", { type: "checkbox", checked: props.checked === true, onChange: function (e) { props.onChange(e.target.checked); }, style: { marginTop: 2 } }),
      h("span", { style: S.checkText },
        h("span", null, props.label),
        props.hint ? h("span", { style: S.checkHint }, props.hint) : null));
  }

  function Row(props) {
    return h("div", { style: S.row },
      h("div", null,
        h("div", { style: S.label }, props.label),
        props.hint ? h("div", { style: S.hint }, props.hint) : null),
      h("div", { style: props.wide ? { width: "100%" } : null }, props.children));
  }

  function TextField(props) {
    return h("input", {
      style: props.wide ? Object.assign({}, S.input, S.inputWide) : S.input,
      value: props.value === undefined || props.value === null ? "" : String(props.value),
      placeholder: props.placeholder || "",
      onChange: function (e) { props.onChange(e.target.value); }
    });
  }

  function NumberField(props) {
    return h("input", {
      type: "number",
      style: Object.assign({}, S.input, S.number),
      value: props.value,
      min: props.min,
      max: props.max,
      step: props.step || 1,
      onChange: function (e) {
        var raw = Number(e.target.value);
        props.onChange(Number.isFinite(raw) ? raw : props.min);
      }
    });
  }

  function Select(props) {
    return h("select", {
      style: S.input,
      value: props.value,
      onChange: function (e) { props.onChange(e.target.value); }
    }, props.options.map(function (option) {
      return h("option", { key: option[0], value: option[0] }, option[1]);
    }));
  }

  function capabilityBadge(name, available, backend) {
    return h("span", { style: S.badge, key: name },
      h("span", { style: available ? S.dotOn : S.dotOff }),
      name + ": " + (available ? T.on : T.off) + (backend && backend !== "none" ? " (" + backend + ")" : ""));
  }

  function App() {
    var snapState = React.useState(null); var snap = snapState[0]; var setSnap = snapState[1];
    var formState = React.useState(null); var form = formState[0]; var setForm = formState[1];
    var statusState = React.useState(""); var status = statusState[0]; var setStatus = statusState[1];
    var busyState = React.useState(false); var busy = busyState[0]; var setBusy = busyState[1];

    React.useEffect(function () {
      fetch("/dsh-system-notify/config")
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (!body || body.ok !== true) throw new Error((body && body.error) || "load failed");
          setSnap(body);
          setForm(clone(body.config));
        })
        .catch(function (error) { setStatus(tr("loadError") + " " + String(error && error.message ? error.message : error)); });
    }, []);

    function update(path, value) { setForm(function (prev) { return setPath(prev, path, value); }); }

    function load() {
      fetch("/dsh-system-notify/config")
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (!body || body.ok !== true) throw new Error((body && body.error) || "load failed");
          setSnap(body);
          setForm(clone(body.config));
          setStatus("");
        })
        .catch(function (error) { setStatus(tr("loadError") + " " + String(error && error.message ? error.message : error)); });
    }

    function save() {
      setBusy(true);
      setStatus(tr("saving"));
      fetch("/dsh-system-notify/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: form })
      })
        .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
        .then(function (result) {
          if (result.ok && result.body.ok) {
            setSnap(result.body);
            setForm(clone(result.body.config));
            setStatus(tr("saved"));
          } else {
            setStatus(tr("saveFailed") + ": " + ((result.body && result.body.error) || "unknown"));
          }
        })
        .catch(function (error) { setStatus(tr("saveFailed") + ": " + String(error)); })
        .finally(function () { setBusy(false); });
    }

    function test(kind, soundKind) {
      setBusy(true);
      setStatus(tr("testing"));
      fetch("/dsh-system-notify/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: kind, sound: soundKind || "normal", style: form.style, config: form })
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body && body.ok) {
            if (body.preview) {
              setStatus(tr("testToast") + " ✓  " + body.preview.title + "\n" + (body.preview.lines || []).join("\n"));
            } else {
              setStatus(tr("testSound") + " ✓");
            }
          } else {
            setStatus(tr("testFailed") + ": " + ((body && body.error) || "unknown"));
          }
        })
        .catch(function (error) { setStatus(tr("testFailed") + ": " + String(error)); })
        .finally(function () { setBusy(false); });
    }

    function reset() {
      setForm(clone(snap.defaults));
      setStatus(tr("resetDone"));
    }

    if (!form || !snap) {
      return h("div", { style: S.page }, h("h1", { style: S.h1 }, tr("title")), h("p", { style: S.intro }, tr("loading")));
    }

    var caps = snap.capabilities || { toast: {}, sound: {}, click: {}, notes: [] };
    var soundOptions = ["none", "system", "chime", "alert", "custom"].map(function (name) { return [name, T.soundLabels[name] || name]; });
    var deliveryOptions = ["both", "toast", "sound"].map(function (name) { return [name, T.deliveryLabels[name] || name]; });
    var languageOptions = ["auto", "zh", "en"].map(function (name) { return [name, T.languageLabels[name] || name]; });
    var styleSamples = snap.styleSamples || {};
    var notes = (caps.notes || []).map(function (code) { return T.notesMap[code] || code; });

    return h("div", { style: S.page },
      h("div", { style: S.header },
        h("h1", { style: S.h1 }, tr("title")),
        h("p", { style: S.intro }, tr("intro"))),

      h("div", { style: S.actions },
        h("label", { style: S.checkRow },
          h("input", { type: "checkbox", checked: form.enabled === true, onChange: function (e) { update("enabled", e.target.checked); } }),
          h("span", { style: S.label }, form.enabled ? tr("enabled") : tr("disabled"))),
        h("span", { style: S.hint },
          tr("backend") + ": " + (snap.platform || "")),
        capabilityBadge(tr("toast"), caps.toast && caps.toast.available, caps.toast && caps.toast.backend),
        capabilityBadge(tr("soundBackend"), caps.sound && caps.sound.available, caps.sound && caps.sound.backend),
        capabilityBadge(tr("clickBackend"), caps.click && caps.click.available, caps.click && caps.click.backend)),

      snap.loadError ? h("div", { style: S.status }, tr("loadError") + " " + snap.loadError) : null,

      notes.length > 0 ? h(Section, { title: tr("notes") },
        h("ul", { style: S.noteList }, notes.map(function (note, index) { return h("li", { key: index }, note); }))) : null,

      h(Section, { title: tr("events"), hint: tr("eventsHint") },
        h("div", { style: S.grid }, Object.keys(T.eventLabels).map(function (key) {
          var labels = eventLabel(key);
          return h(Check, {
            key: key,
            label: labels[0],
            hint: labels[1],
            checked: form.events && form.events[key] === true,
            onChange: function (value) { update("events." + key, value); }
          });
        }))),

      h(Section, { title: tr("style"), hint: tr("styleHint") },
        h("div", { style: S.styleGrid, role: "radiogroup" }, ["privacy", "simple", "standard", "detailed"].map(function (style) {
          var labels = styleLabel(style);
          var sample = styleSamples[style];
          var active = form.style === style;
          return h("div", {
            key: style,
            role: "radio",
            tabIndex: 0,
            "aria-checked": active,
            style: Object.assign({}, S.styleCard, active ? S.styleCardActive : {}),
            onClick: function () { update("style", style); },
            onKeyDown: function (event) {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                update("style", style);
              }
            }
          },
            h("div", { style: S.styleName }, labels[0]),
            h("div", { style: S.styleDesc }, labels[1]),
            sample ? h("div", { style: S.stylePreview },
              sample.title + (sample.lines && sample.lines.length ? "\n" + sample.lines.join("\n") : "")) : null);
        }))),

      h(Section, { title: tr("sound"), hint: tr("soundHint") },
        h(Check, {
          label: tr("soundEnabled"),
          checked: form.sound && form.sound.enabled === true,
          onChange: function (value) { update("sound.enabled", value); }
        }),
        h("div", { style: S.grid },
          h(Row, { label: tr("normalSound") },
            h(Select, { value: form.sound.normal, options: soundOptions, onChange: function (value) { update("sound.normal", value); } })),
          h(Row, { label: tr("errorSound") },
            h(Select, { value: form.sound.error, options: soundOptions, onChange: function (value) { update("sound.error", value); } }))),
        form.sound.normal === "custom" || form.sound.error === "custom"
          ? h(Row, { label: tr("customPath"), hint: tr("customPathHint"), wide: true },
              h(TextField, { wide: true, value: form.sound.customPath, placeholder: "C:\\sounds\\done.wav", onChange: function (value) { update("sound.customPath", value); } }))
          : null,
        h(Row, { label: tr("volume"), hint: tr("volumeHint") },
          h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            h("input", { type: "range", min: 0, max: 100, step: 5, value: form.sound.volume, onChange: function (e) { update("sound.volume", Number(e.target.value)); } }),
            h("span", { style: S.hint }, String(form.sound.volume) + "%"))),
        h("div", { style: S.actions },
          h("button", { style: Object.assign({}, S.btn, S.btnGhost), disabled: busy, onClick: function () { test("sound", "normal"); } }, tr("testSound")))),

      h(Section, { title: tr("delivery"), hint: tr("deliveryHint") },
        h(Row, { label: tr("delivery") },
          h(Select, { value: form.delivery, options: deliveryOptions, onChange: function (value) { update("delivery", value); } }))),

      h(Section, { title: tr("quiet"), hint: "" },
        h(Check, {
          label: tr("quietEnabled"),
          checked: form.quietHours && form.quietHours.enabled === true,
          onChange: function (value) { update("quietHours.enabled", value); }
        }),
        form.quietHours.enabled ? h("div", null,
          h("div", { style: S.grid },
            h(Row, { label: tr("quietStart") },
              h("input", { type: "time", style: S.input, value: form.quietHours.start, onChange: function (e) { update("quietHours.start", e.target.value); } })),
            h(Row, { label: tr("quietEnd") },
              h("input", { type: "time", style: S.input, value: form.quietHours.end, onChange: function (e) { update("quietHours.end", e.target.value); } }))),
          h(Check, {
            label: tr("allowCritical"),
            checked: form.quietHours.allowCritical === true,
            onChange: function (value) { update("quietHours.allowCritical", value); }
          })) : null),

      h(Section, { title: tr("filters"), hint: "" },
        h("div", { style: S.grid },
          h(Row, { label: tr("minDuration"), hint: tr("minDurationHint") },
            h(NumberField, { value: form.minDurationSec, min: 0, max: 86400, onChange: function (value) { update("minDurationSec", value); } })),
          h(Row, { label: tr("cooldown"), hint: tr("cooldownHint") },
            h(NumberField, { value: form.cooldownSec, min: 0, max: 3600, onChange: function (value) { update("cooldownSec", value); } }))),
        h(Check, {
          label: tr("ignoreSubagent"),
          checked: form.ignoreSubagentSessions === true,
          onChange: function (value) { update("ignoreSubagentSessions", value); }
        })),

      h(Section, { title: tr("include"), hint: "" },
        h("div", { style: S.grid },
          h(Check, { label: tr("includeSession"), checked: form.include.sessionTitle, onChange: function (value) { update("include.sessionTitle", value); } }),
          h(Check, { label: tr("includeSummary"), checked: form.include.summary, onChange: function (value) { update("include.summary", value); } }),
          h(Check, { label: tr("includeWorkspace"), checked: form.include.workspace, onChange: function (value) { update("include.workspace", value); } }),
          h(Check, { label: tr("includeDuration"), checked: form.include.duration, onChange: function (value) { update("include.duration", value); } }),
          h(Check, { label: tr("includeSessionId"), checked: form.include.sessionId, onChange: function (value) { update("include.sessionId", value); } })),
        h(Row, { label: tr("summaryChars") },
          h(NumberField, { value: form.summaryMaxChars, min: 40, max: 500, step: 10, onChange: function (value) { update("summaryMaxChars", value); } }))),

      h(Section, { title: tr("click"), hint: "" },
        h(Check, {
          label: tr("clickEnabled"),
          checked: form.click && form.click.enabled === true,
          onChange: function (value) { update("click.enabled", value); }
        }),
        form.click.enabled ? h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
          h(Row, { label: tr("clickUrl"), hint: tr("clickUrlHint"), wide: true },
            h(TextField, { wide: true, value: form.click.url, placeholder: "dsh://open", onChange: function (value) { update("click.url", value); } })),
          h(Row, { label: tr("clickTitle"), hint: tr("clickTitleHint"), wide: true },
            h(TextField, { wide: true, value: form.click.focusWindowTitle, placeholder: "DeepSeek Harness", onChange: function (value) { update("click.focusWindowTitle", value); } })),
          h(Check, {
            label: tr("clickFallback"),
            checked: form.click.openFallback === true,
            onChange: function (value) { update("click.openFallback", value); }
          })) : null),

      h(Section, { title: tr("advanced"), hint: "" },
        h("div", { style: S.grid },
          h(Row, { label: tr("language") },
            h(Select, { value: form.language, options: languageOptions, onChange: function (value) { update("language", value); } })),
          h(Row, { label: tr("appName") },
            h(TextField, { value: form.appName, onChange: function (value) { update("appName", value); } }))),
        h(Row, { label: tr("appId"), hint: tr("appIdHint"), wide: true },
          h(TextField, { wide: true, value: form.windows.appId, onChange: function (value) { update("windows.appId", value); } })),
        h(Row, { label: tr("iconPath"), hint: tr("iconPathHint"), wide: true },
          h(TextField, { wide: true, value: form.iconPath, placeholder: "C:\\icons\\notify.png", onChange: function (value) { update("iconPath", value); } })),
        h(Check, {
          label: tr("agentTool"),
          hint: tr("agentToolHint"),
          checked: form.agentTool === true,
          onChange: function (value) { update("agentTool", value); }
        })),

      h("div", { style: S.actions },
        h("button", { style: S.btn, disabled: busy, onClick: save }, tr("save")),
        h("button", { style: Object.assign({}, S.btn, S.btnGhost), disabled: busy, onClick: function () { test("notification"); } }, tr("testToast")),
        h("button", { style: Object.assign({}, S.btn, S.btnGhost), disabled: busy, onClick: load }, tr("reload")),
        h("button", { style: Object.assign({}, S.btn, S.btnGhost), disabled: busy, onClick: reset }, tr("reset"))),

      h("div", { style: S.status }, status),

      h("div", { style: S.hint },
        tr("configPath") + ": ",
        h("span", { style: S.mono }, snap.configPath || "")),
      h("div", { style: S.hint }, "v" + (snap.version || "")));
  }

  exports.name = "dsh-system-notify";
  exports.inject = ["slots"];
  exports.apply = function (ctx) {
    ctx.slots.inject(SLOT, function () {
      return ctx.slots.register({
        name: SLOT,
        id: SECTION_ID,
        order: 55,
        label: function () { return tr("title"); }
      }, function () { return h(App); });
    });
  };
  return module.exports;
}});
