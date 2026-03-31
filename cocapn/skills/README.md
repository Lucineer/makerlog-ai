# Skills — The Kung-Fu Pattern

## What Are Skills?

Skills are injectable knowledge cartridges. Think of the scene in The Matrix
where Neo downloads "I know kung-fu" — that is exactly what skills do for the
agent. A skill is a focused bundle of context, instructions, and examples
that gets injected into the agent's system prompt on demand.

## How to Create a Skill Cartridge

A skill is a directory under `cocapn/skills/` with this structure:

```
cocapn/skills/
  react-expert/
    manifest.json    # Name, description, trigger keywords
    knowledge.md     # The actual knowledge to inject
    examples/        # Optional worked examples
      component.md
      hooks.md
```

### manifest.json

```json
{
  "name": "react-expert",
  "description": "Deep knowledge of React patterns, hooks, and performance",
  "version": "1.0.0",
  "triggers": ["react", "component", "hooks", "jsx"],
  "author": "makerlog-ai"
}
```

### knowledge.md

Write this as if you are teaching a knowledgeable developer. Include:
- Core concepts and mental models
- Common patterns and anti-patterns
- Performance considerations
- Links to canonical references

## How Skills Are Injected

When a user message matches a skill's trigger keywords, the skill's
`knowledge.md` content is prepended to the agent's context window before
the message is processed. Multiple skills can be active simultaneously.

The injection flow:

1. User sends message
2. Agent scans message for trigger keywords
3. Matching skill knowledge is loaded from `cocapn/skills/`
4. Knowledge is injected into the system prompt
5. Agent processes the message with full skill context

## Example: Adding a "React Expert" Skill

1. Create `cocapn/skills/react-expert/manifest.json`
2. Create `cocapn/skills/react-expert/knowledge.md` with React patterns
3. Add trigger keywords: `react`, `component`, `hooks`
4. The agent now has deep React knowledge when those keywords appear

Skills are version-controlled alongside the code. They grow with the project.
