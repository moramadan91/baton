# Hive

[English](#english) · [العربية](#العربية)

<a id="english"></a>

## English

**One model conducts. The rest play.** Hive is a Claude Code plugin that splits one task across several models, so your Claude tokens go to planning and review, and a live pane beside the chat shows who is doing what.

## How it works

| Who | Does |
| --- | --- |
| Opus (your main chat) | plans, decides, reviews the final result |
| Haiku (`hive:runner`) | commands, tests, builds, searches, reading many files |
| Sonnet (`hive:worker`) | multi-step chores that need judgement (docs, checklists) |
| Codex (OpenAI, `mcp__hive__codex`) | writes and fixes code, reviews diffs read-only |
| Muse Code (Meta, `mcp__hive__muse`) | writes code on independent files in parallel with Codex, takes over when Codex is out of quota, cross-reviews Codex |
| Local models (optional, Ollama) | small scoped edits, free and private, slower |

The loop:
1. You say what to build. Claude makes a **plan** with a short title and steps, and each step has an owner.
2. Claude hands each step to its owner. Codex and Muse get a ticket with the files they may write; those files are locked while they run.
3. Claude checks every report: it has Haiku run the tests and `git diff --stat`, reads the parts that matter, and sends failures back to the same owner.
4. At the end the pane shows the task report: time, Claude limits before and after, tokens per model.

## The pane

The **Hive** pane shows, live:
- the plan, each step's owner and timer, overall percent and elapsed time;
- who is working now: Codex's file and command, Muse's files, each subagent's model, task and tokens;
- the Local (Ollama) section: the model each local job runs, its status, and whether its changes need review;
- this task's Claude 5-hour and weekly limit before and after, and tokens per model;
- session tokens per model and your current limits.

Open it with `/hive-pane`. Turn the workflow on with `/hive`.

## Install

In Claude Code:

```
/plugin marketplace add moramadan91/hive
/plugin install hive@hive
```

Then type `/hive` in any chat and say what you want built.

Or drop [`Hive-Start.md`](Hive-Start.md) into any chat: Claude installs Hive if it is missing, checks Codex, and turns Hive on.

After an update, run `/plugin marketplace update hive` and `/plugin update hive@hive`, then restart Claude Code.

## Needs

- **Claude Code** with plugin hooks support (the pane and the Codex tool use them).
- **[Codex CLI](https://github.com/openai/codex)** logged in with your ChatGPT account, on your PATH. No API keys.
- **Muse Code CLI** (optional) logged in with your Meta account. Hive uses `~/.local/bin/muse` unless `HIVE_MUSE_BIN` is set.
- **Ollama** and local models (optional). See below.

Optional, in `~/.claude/settings.json` under `env`:
- `HIVE_CODEX_MODEL`: the Codex model to use.
- `HIVE_CODEX_PROVIDER`: for example `openai` when your Codex config points at another provider.
- `HIVE_CODEX_EFFORT`: reasoning effort, default `medium`.
- `HIVE_MUSE_MODEL` and `HIVE_MUSE_EFFORT`: Muse's model and default effort.
- `HIVE_HANDOFF_PCT`: the limit percent that makes Claude write `HANDOFF.md`, default `95`.

## Local models (optional)

Local models do small scoped edits for free, on your machine. They run through a separate local MCP server (`coding-delegator`), not through this plugin. Hive only hands them steps and shows their jobs in the pane.

**Before the first use, pull the models once. Hive does not download them for you.** Each model is several GB and runs on your GPU:

```bash
ollama pull qwen3:14b
ollama pull deepseek-coder-v2:16b
ollama pull gpt-oss:20b
```

After that, Hive picks a model per job from the allowed list and starts it on its own. The delegator refuses a model that is not on the list or not pulled yet, and tells you the `ollama pull` command to run.

Notes:
- Each model needs about 9 to 13 GB of GPU memory. On a 24 GB Mac, run one large model at a time if the Mac starts to swap.
- Check what is installed with `ollama list`.

## Mac launcher

`plugins/hive/bin/Hive.command`: double-click, pick a project folder, and Claude Code opens there with Hive on.

Token and cost figures are client-side estimates, not your bill.

## License

MIT

---

<a id="العربية"></a>

## العربية

**موديل واحد يقود، والباقي يشتغلوا.** Hive إضافة (plugin) لـClaude Code بتقسّم الشغل على كذا موديل، علشان توكنز Claude تروح على التخطيط والمراجعة بس، وفي لوحة حيّة جنب الشات بتوريك مين شغّال على إيه.

## إزاي بيشتغل

| مين | بيعمل إيه |
| --- | --- |
| Opus (الشات الرئيسي عندك) | بيخطط، بيقرر، وبيراجع النتيجة النهائية |
| Haiku (`hive:runner`) | الأوامر، التستات، الـbuilds، البحث، وقراية ملفات كتير |
| Sonnet (`hive:worker`) | الشغل المتعدد الخطوات اللي محتاج تقدير (توثيق، قوائم مراجعة) |
| Codex (OpenAI، `mcp__hive__codex`) | بيكتب ويصلّح الكود، ويراجع الـdiffs للقراءة بس |
| Muse Code (Meta، `mcp__hive__muse`) | بيكتب كود على ملفات مستقلة بالتوازي مع Codex، وبياخد الشغل لو Codex خلص الحصة، وبيراجع شغل Codex |
| موديلات محلية (اختياري، عن طريق Ollama) | تعديلات صغيرة ومحددة، مجانية وخاصة، بس أبطأ |

الدورة بتشتغل كده:
1. انت بتقول عايز إيه. Claude يعمل **خطة** فيها عنوان قصير وخطوات، وكل خطوة ليها صاحب.
2. Claude بيدّي كل خطوة لصاحبها. Codex وMuse بياخدوا تذكرة فيها الملفات اللي مسموح لهم يكتبوها، والملفات دي بتتقفل وهما شغّالين.
3. Claude بيراجع كل تقرير: بيخلّي Haiku يشغّل التستات و`git diff --stat`، وبيقرا الأجزاء المهمة، ولو فيه فشل بيرجّعه لنفس الصاحب.
4. في الآخر اللوحة بتوريك تقرير المهمة: الوقت، حدود Claude قبل وبعد، والتوكنز لكل موديل.

## اللوحة (The pane)

لوحة **Hive** بتوريك وانت شغّال:
- الخطة، وصاحب كل خطوة وعدّادها، ونسبة الإنجاز الكلية والوقت اللي فات؛
- مين شغّال دلوقتي: الملف والأمر بتوع Codex، ملفات Muse، موديل وشغل وتوكنز كل subagent؛
- قسم Local (Ollama): الموديل اللي كل مهمة محلية بتشتغل عليه، وحالتها، ولو تغييراتها محتاجة مراجعة؛
- حدود Claude لمدة 5 ساعات وأسبوعية للمهمة دي قبل وبعد، والتوكنز لكل موديل؛
- توكنز الجلسة لكل موديل، وحدودك الحالية.

افتح اللوحة بـ`/hive-pane`، وشغّل النظام بـ`/hive`.

## التثبيت

جوه Claude Code:

```
/plugin marketplace add moramadan91/hive
/plugin install hive@hive
```

بعدين اكتب `/hive` في أي شات وقول عايز إيه يتبنى.

أو حط ملف [`Hive-Start.md`](Hive-Start.md) في أي شات: Claude هيركّب Hive لو مش موجود، ويتأكد من Codex، ويشغّل Hive.

بعد أي تحديث، شغّل `/plugin marketplace update hive` و`/plugin update hive@hive`، وبعدين أعد تشغيل Claude Code.

## المتطلبات

- **Claude Code** بدعم plugin hooks (اللوحة وأداة Codex بيعتمدوا عليه).
- **[Codex CLI](https://github.com/openai/codex)** مسجّل دخول بحساب ChatGPT بتاعك، وموجود في الـPATH. مفيش API keys.
- **Muse Code CLI** (اختياري) مسجّل دخول بحساب Meta بتاعك. Hive بيستخدم `~/.local/bin/muse` إلا لو حطيت `HIVE_MUSE_BIN`.
- **Ollama** وموديلات محلية (اختياري). شوف القسم اللي تحت.

اختياري، في `~/.claude/settings.json` تحت `env`:
- `HIVE_CODEX_MODEL`: موديل Codex اللي عايزه.
- `HIVE_CODEX_PROVIDER`: مثلاً `openai` لو إعداد Codex بتاعك بيشاور على provider تاني.
- `HIVE_CODEX_EFFORT`: مجهود التفكير، الافتراضي `medium`.
- `HIVE_MUSE_MODEL` و`HIVE_MUSE_EFFORT`: موديل Muse والمجهود الافتراضي.
- `HIVE_HANDOFF_PCT`: نسبة الحد اللي تخلّي Claude يكتب `HANDOFF.md`، الافتراضي `95`.

## الموديلات المحلية (اختياري)

الموديلات المحلية بتعمل تعديلات صغيرة ومحددة بالمجان، على جهازك. بتشتغل عن طريق سيرفر MCP محلي منفصل اسمه `coding-delegator`، مش جوه الإضافة دي. Hive بس بيدّيها الخطوات ويعرض مهامها في اللوحة.

**قبل أول استخدام، نزّل الموديلات مرة واحدة. Hive مش بيحمّلهم عنك.** كل موديل كذا GB وبيشتغل على كارت الشاشة:

```bash
ollama pull qwen3:14b
ollama pull deepseek-coder-v2:16b
ollama pull gpt-oss:20b
```

بعد كده، Hive بيختار موديل لكل مهمة من القايمة المسموحة ويشغّله لوحده. الـdelegator بيرفض أي موديل مش في القايمة أو مش متنزّل، ويقولك أمر `ollama pull` اللي تشغّله.

ملاحظات:
- كل موديل محتاج حوالي 9 لـ13 GB من ذاكرة كارت الشاشة. على Mac بـ24 GB، شغّل موديل كبير واحد في المرة لو الجهاز بدأ يعمل swap.
- شوف الموديلات المتنزّلة بـ`ollama list`.

## لانشر الـMac

`plugins/hive/bin/Hive.command`: دبل كليك، اختار فولدر المشروع، وClaude Code هيفتح فيه وHive شغّال.

أرقام التوكنز والتكلفة تقديرية من جهازك، مش فاتورتك.

## الترخيص

MIT
