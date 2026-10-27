# dsh-system-notify

给 **DeepSeek Harness** 的 Codex 风格桌面系统通知：任务完成、出错、需要输入、目标完成时弹出系统通知并播放提示音。可配置通知事件、音效、通知风格（隐私 / 简洁 / 标准 / 详细）、免打扰时段、点击唤起 DSH 窗口等。

支持 **Windows 10/11** 与 **Ubuntu 22.04/24.04**（macOS 为尽力支持）。

[![CI](https://github.com/JamesYasR/dsh-system-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/JamesYasR/dsh-system-notify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 为什么不用一个 notify 脚本？

Codex 只在每轮结束时执行一个 hook；本插件是事件驱动的：

| | Codex 风格 notify 脚本 | dsh-system-notify |
|---|---|---|
| 任务完成 | ✅ | ✅ 带摘要、项目、耗时 |
| 任务出错 | ⚠️ 需要自己写 | ✅ 带错误信息与错误码 |
| 需要输入 / 批准 | ❌ | ✅ |
| 目标完成 / 受阻 | ❌ | ✅ |
| 子任务 / 工作流完成 | ❌ | ✅ 可选 |
| 通知风格 | ❌ | ✅ 隐私 / 简洁 / 标准 / 详细 |
| 音效选择 | ❌ | ✅ 系统 / 清脆 / 警示 / 自定义 |
| 免打扰与冷却 | ❌ | ✅ |
| 点击唤起 DSH | ❌ | ✅ 可开关 |
| 图形设置页 | ❌ | ✅ 设置 → 系统通知 |

全部在本机完成，不联网、不上报、不把内容写到磁盘。

## 功能

- **11 类通知事件**：轮次完成 / 出错 / 受阻 / 输出截断 / 取消、需要输入、需要批准、目标完成 / 受阻、子任务完成、工作流完成。
- **四种通知风格**：隐私（只显示事件类型）、简洁、标准、详细。
- **音效**：系统默认、内置两个原创提示音、自定义文件；普通事件与错误事件可分别配置；Ubuntu 支持音量。
- **通知方式**：通知 + 音效、仅通知、仅音效。
- **免打扰时段**：夜间静音，可选择仍提醒严重错误。
- **频率控制**：最短任务时长、同类通知冷却、忽略子代理会话。
- **点击唤起**：Windows 使用 DSH 桌面版官方 `dsh://open` 深链；Ubuntu 通过 `wmctrl`/`xdotool` 聚焦窗口，找不到再打开链接。整个点击行为可关闭。
- **Agent 工具（可选）**：注册 `send_desktop_notification`，让 Agent 主动提醒你。
- **中英双语**：设置页跟随浏览器语言；通知文本可跟随系统或强制中文/English。
- **零运行时依赖**：只用 Node 内置模块和操作系统通知能力。

## 通知风格示意

假设事件为：

```text
kind=turnComplete
会话=重构设置页
项目=D:\workspace\demo
摘要=设置页改造完成，已验证保存、测试通知与音效播放。
耗时=1 分 12 秒
```

| 风格 | 通知内容 |
|---|---|
| **隐私** | 只有标题：`任务完成`，不显示会话名、摘要、路径、错误详情。 |
| **简洁** | `任务完成` · `重构设置页` |
| **标准** | 标题 + 会话名 + 摘要 + `demo · 耗时 1 分 12 秒` |
| **详细** | 标题带会话名 + 摘要 + 完整路径 + `第 3 轮 · 耗时 1 分 12 秒 · 错误码 …` |

错误事件始终使用 `critical` 紧急级别（Linux）与错误音效；隐私风格仍会隐藏错误正文。

## 环境要求

### Windows

- Windows 10（1809+）或 Windows 11。
- DSH 桌面版。插件使用：
  - PowerShell 5.1 + WinRT Toast（系统自带）；
  - DSH 桌面版 Start Menu 快捷方式注册的 Toast AppID `com.deepseek.dsh`（不可用时助手会回退到其他已注册 Toast 源，最后回退到 Windows PowerShell）；
  - DSH 桌面版的 `dsh://open` 协议实现点击唤起窗口。
- 自定义音效由 PowerShell 助手通过 `System.Media.SoundPlayer` 播放，必须是 **PCM WAV**；内置音效已是 WAV。
- 通知受 Windows 专注助手 / 勿扰模式影响。若没有弹窗，请检查“DeepSeek Harness”的通知权限。

### Ubuntu

安装通知与音频工具（多数桌面已自带一部分）：

```bash
sudo apt install libnotify-bin libglib2.0-bin pulseaudio-utils wmctrl
```

- `libnotify-bin`：提供 `notify-send`（`gdbus` 不可用时的回退）。
- `libglib2.0-bin`：提供 `gdbus` 与 `dbus-monitor`，**可点击通知必需**。
- `pulseaudio-utils`：提供 `paplay`（PipeWire 系统一般有 `pw-play`，同样支持）。
- `wmctrl`（或 `xdotool`）：点击时聚焦 DSH 窗口；没有时回退为打开链接。

可点击通知通过标准 `org.freedesktop.Notifications` DBus 接口实现：`gdbus` 发出带 `default` action 的通知，`dbus-monitor` 监听 `ActionInvoked`。

### macOS（尽力支持）

`osascript` 显示通知、`afplay` 播放音效。点击唤起需要 [`terminal-notifier`](https://github.com/julienXX/terminal-notifier)（`brew install terminal-notifier`），否则仅显示通知。

## 安装

### 从 GitHub 安装

```bash
dsh plugin --profile desktop add github:JamesYasR/dsh-system-notify
```

### 从本地目录安装

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-system-notify
```

也可以打开 DSH Web UI：**设置 → 插件 → 安装**，填入 GitHub 地址或本地目录。

安装后打开 **设置 → 系统通知**。插件默认启用；设置页顶部会显示检测到的后端和缺失的系统依赖。

## 配置项

配置文件位置：

- Windows：`%APPDATA%\dsh-system-notify\config.json`
- Linux / macOS：`$XDG_CONFIG_HOME/dsh-system-notify/config.json`（默认 `~/.config/dsh-system-notify/config.json`）

可用环境变量 `DSH_SYSTEM_NOTIFY_CONFIG=/path/to/config.json` 覆盖。

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关。 |
| `events.turnComplete` | `true` | 正常完成一轮。 |
| `events.turnError` | `true` | 轮次因错误结束。 |
| `events.turnBlocked` | `true` | 轮次受阻（刚问过问题时会去重）。 |
| `events.turnMaxTokens` | `true` | 输出达到长度上限。 |
| `events.turnAborted` | `false` | 用户取消 / 中断。 |
| `events.needsInput` | `true` | `ask_user_question` 等待回答。 |
| `events.approvalRequest` | `true` | 工具调用等待批准。 |
| `events.goalComplete` | `true` | 长期目标完成。 |
| `events.goalBlocked` | `true` | 长期目标受阻。 |
| `events.subagentComplete` | `false` | 子代理结束。 |
| `events.workflowComplete` | `false` | 工作流结束。 |
| `style` | `standard` | `privacy` / `simple` / `standard` / `detailed`。 |
| `language` | `auto` | `auto` / `zh` / `en`。 |
| `sound.enabled` | `true` | 是否播放音效。 |
| `sound.normal` | `system` | 普通事件音效：`none` / `system` / `chime` / `alert` / `custom`。 |
| `sound.error` | `alert` | 错误事件音效，取值同上。 |
| `sound.customPath` | `""` | 自定义音频；Windows 仅 WAV，Ubuntu 支持 WAV/OGG。 |
| `sound.volume` | `80` | 0–100，仅 Ubuntu（`paplay`/`pw-play`）。 |
| `delivery` | `both` | `both` / `toast` / `sound`。 |
| `quietHours.enabled` | `false` | 启用免打扰。 |
| `quietHours.start` / `end` | `22:00` / `08:00` | 本地时间，支持跨夜。 |
| `quietHours.allowCritical` | `true` | 免打扰期间仍提醒关键事件：错误、目标受阻，以及需要你处理的阻塞提示（输入/批准）。 |
| `minDurationSec` | `0` | 成功完成且耗时达到该秒数才通知。 |
| `cooldownSec` | `10` | 同类通知最小间隔；严重错误不受限。 |
| `include.sessionTitle` | `true` | 显示会话名。 |
| `include.summary` | `true` | 显示摘要 / 问题 / 错误信息。 |
| `include.workspace` | `true` | 标准风格显示项目名，详细风格显示完整路径。 |
| `include.duration` | `true` | 显示耗时。 |
| `include.sessionId` | `false` | 显示短会话 ID。 |
| `summaryMaxChars` | `140` | 摘要截断长度（40–500）。 |
| `ignoreSubagentSessions` | `true` | 忽略子代理会话的轮次通知。 |
| `click.enabled` | `true` | 点击通知唤起 DSH 窗口。 |
| `click.url` | `dsh://open` | 点击打开的深链或网址。 |
| `click.focusWindowTitle` | `DeepSeek Harness` | Ubuntu 用该标题匹配窗口。 |
| `click.openFallback` | `true` | Ubuntu 找不到窗口时打开上面的链接。 |
| `appName` | `DeepSeek Harness` | Linux 通知显示的应用名。 |
| `windows.appId` | `com.deepseek.dsh` | Windows Toast AppID，一般无需修改。 |
| `iconPath` | `""` | 自定义 PNG 图标；留空使用内置图标。 |
| `agentTool` | `false` | 注册 `send_desktop_notification` 工具。 |

## 点击唤起 DSH

### Windows

Toast 使用 `activationType="protocol"`、`launch="dsh://open"`，并带一个“打开 DSH”按钮。DSH 桌面版注册了该协议，单实例回调会恢复、显示并聚焦主窗口。这与 DSH 自己的深链路径一致，插件不需要额外注册表项或常驻进程。

- 关闭 `click.enabled` 后通知不可点击。
- 如果用的是网页版 DSH，把 `click.url` 改成 DSH 的网页地址即可在点击时用浏览器打开。

### Ubuntu

`notify-send` 本身不支持点击回调，因此插件：

1. 用 `gdbus … Notify` 发出带 `default` action 的通知；
2. 启动一个临时的 `dbus-monitor` 监听该通知的 `ActionInvoked`；
3. 点击后先用 `xdotool` / `wmctrl` 按 `click.focusWindowTitle` 聚焦窗口，找不到再 `xdg-open <click.url>`。

如果系统没有 `gdbus`，会退回 `notify-send`；如果没有 `dbus-monitor`，`gdbus` 仍能发出通知但无法捕获点击，因此通知不可点击。如果 Ubuntu 上 DSH 跑在浏览器里，请把 `click.focusWindowTitle` 设为浏览器窗口标题包含的文字（例如 `DeepSeek Harness`），或者把 `click.url` 改成 DSH 网页地址。Wayland 下 `wmctrl`/`xdotool` 可能不可用，此时点击会回退为打开 `click.url`。

## 事件来源

| 通知 | DSH 来源 |
|---|---|
| 完成 / 出错 / 受阻 / 输出截断 / 取消 | 持久化的 `turn/end` 会话事件及其 `reason` |
| 需要输入 | `user-questions/request`（在交给正常回答者前通知） |
| 需要批准 | `approval/request`（在交给正常回答者前通知） |
| 目标完成 / 受阻 | `goal/changed`，operation 为 `complete` / `block` |
| 子任务完成 | `subagent/end` |
| 工作流完成 | `workflow/end` |
| 自定义 | Agent 工具 `send_desktop_notification` |

去重规则：刚问过问题后的 60 秒内不再发“受阻”；目标完成后的 8 秒内不再发重复的“任务完成”。

## 隐私

- 通知内容只存在于进程内存（Windows 通过环境变量传给 PowerShell 助手）和系统弹窗中；插件自身除配置文件外不落盘，但 Windows 通知中心可能按系统设置保留已显示的通知。
- 配置文件在支持 POSIX 权限的系统上以 `0600` 写入。
- **隐私风格**会移除会话名、摘要、路径、会话 ID 和错误文本，只保留事件类型与音效。
- 点击链接使用白名单校验：只允许 `http:`、`https:`、`dsh:`；拒绝 `file:`、`javascript:`、`ms-msdt:` 等其他协议。
- HTTP 路由仅同源可用，校验 `Origin`，请求体上限 256 KiB。

## 常见问题

### Windows 没有弹窗

1. 检查 Windows **设置 → 系统 → 通知** 是否允许“DeepSeek Harness”。
2. 检查专注助手 / 勿扰模式；某些模式下通知只进通知中心，不显示横幅。
3. 确认插件与对应事件已启用。
4. 默认 AppID 为 `com.deepseek.dsh`，由 DSH 桌面版 Start Menu 快捷方式注册；助手会回退到其他已注册 Toast 源，最后回退到始终注册的 Windows PowerShell Toast 源。需要时可在设置中显式指定 `windows.appId`。

### Windows 没有声音

- 自定义音效必须是本地 **WAV**；OGG/MP3 不会播放。
- 检查系统音量与输出设备。
- 先用设置页的“试听音效”；如果能响，问题在事件音效选择。

### Ubuntu 没有声音

- 安装 `pulseaudio-utils`（`paplay`），或确认存在 `pw-play`。
- 系统音效文件 `/usr/share/sounds/freedesktop/stereo/complete.oga` 不存在时会回退到内置提示音。

### Ubuntu 没有通知

- 需要正在运行的通知守护进程（GNOME Shell、KDE、dunst、mako 等）；纯 SSH 无桌面会话不会显示。
- 安装 `libnotify-bin`；设置页会显示检测到的后端。

### 点击没有唤起 DSH

- Windows：需要安装 DSH 桌面版，使 `dsh://` 协议存在。可在“运行”对话框输入 `dsh://open` 验证。
- Ubuntu：安装 `wmctrl`/`xdotool` 与 `libglib2.0-bin`；确认窗口标题包含 `click.focusWindowTitle`。
- 网页版 DSH：把 `click.url` 改成 DSH 网页地址。

### 仍然没有解决

- 设置页点“发送测试通知”“试听音效”。
- 查看设置页底部的配置文件路径。
- 在 Host 环境设置 `DSH_SYSTEM_NOTIFY_DRY_RUN=1`，只记录将要发送的内容而不真正发送。
- 查看 DSH Host 日志里的 `[dsh-system-notify]` 警告。

## 开发

```bash
git clone https://github.com/JamesYasR/dsh-system-notify.git
cd dsh-system-notify
node --test          # 单元测试：配置、格式化、策略、平台 payload
npm run verify       # 所有运行时模块语法检查
python tools/generate-sounds.py   # 重新生成内置 WAV
python tools/generate-icon.py     # 重新生成 icon.png（Pillow）
```

本地安装：

```bash
dsh plugin --profile desktop add /absolute/path/to/dsh-system-notify
```

目录结构见英文 README（`index.mjs`、`lib/*`、`client/client.js`、`test/*`、`tools/*`）。

## 限制

- Windows 通知音量由系统音效方案控制；`sound.volume` 仅对 Ubuntu 生效。
- Windows 自定义音效仅支持 WAV。
- 点击只聚焦 DSH 主窗口，不定位到具体会话（DSH 深链为 `dsh://open`）。
- Linux 点击依赖 `gdbus`、`dbus-monitor` 和实现 freedesktop 规范的通知守护进程。
- macOS 为尽力支持，点击需要 `terminal-notifier`。
- 系统专注模式可能抑制横幅，这是操作系统行为。

## 许可证

[MIT](LICENSE)。两个内置提示音由 `tools/generate-sounds.py` 原创生成，图标为本项目原创 SVG/PNG，均使用同一许可证。
