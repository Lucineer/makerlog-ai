# Skills Guide

Skills are the primary way to extend the agent's knowledge without changing
code. This guide covers using existing skills and creating new ones.

## Using Skills

Skills live in `cocapn/skills/`. Each skill is a directory containing:

- `manifest.json` — metadata and trigger keywords
- `knowledge.md` — the knowledge content injected into context
- `examples/` — optional worked examples

Skills activate automatically when a user message contains matching trigger
keywords. No configuration needed — just create the skill directory.

## Creating a Skill

### 1. Create the directory

```bash
mkdir -p cocapn/skills/my-skill
```

### 2. Write manifest.json

```json
{
  "name": "my-skill",
  "description": "What this skill teaches the agent",
  "version": "1.0.0",
  "triggers": ["keyword1", "keyword2"],
  "author": "your-name"
}
```

### 3. Write knowledge.md

Write clear, structured knowledge. Use headings, code blocks, and lists.
Focus on practical patterns the agent can apply immediately.

### 4. Commit

```bash
git add cocapn/skills/my-skill/
git commit -m "feat: add my-skill cartridge"
```

## Best Practices

- **One concept per skill** — keep each skill focused
- **Include examples** — the agent learns best from concrete cases
- **Use trigger keywords that appear naturally** in user messages
- **Version your skills** alongside the code they relate to
- **Test skills** by sending messages with trigger keywords and checking the response quality

## Built-in Skills

Check `cocapn/skills/` for skills that ship with makerlog-ai. Each includes
a manifest with description and trigger keywords.
