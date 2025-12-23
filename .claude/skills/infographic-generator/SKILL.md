---
name: infographic-generator
description: Generate retro arcade style infographic prompts for documentation pages
---

# Generate Infographic Prompt

Generate an image AI prompt for creating a retro arcade style infographic for a documentation page.

## Workflow

### Step 1: Ask for the docs page

Ask the user: "Which documentation page should this infographic be for?"

Present options from the docs/ directory (use Glob to find all .md files in docs/), or let them specify a custom topic.

### Step 2: Read the documentation

Read the specified documentation file to understand its content.

### Step 3: Generate the image prompt

Create a retro arcade style prompt following this format:

```text
Create a retro 8-bit pixel art infographic for "[PAGE TITLE]" from DevOps AI Toolkit.

Style: Retro arcade game aesthetic, pixel art, CRT glow effects, scanlines, neon pink/cyan on dark background, NES game instruction card style.

TOPIC: [One sentence describing what this page covers]

KEY CONCEPTS (visualize as power-ups/abilities):

[For each major section/concept in the doc, write ONE line like:]
1. [Icon emoji] [CONCEPT NAME]: [One sentence description - no bullet lists]

[Include 3-6 concepts depending on the doc's content]

Include pixel art icons, game-style UI elements, and achievement badges related to the topic.
```

### Step 4: Present the prompt

Show the generated prompt in a code block so the user can copy it.

Then say: "Copy this prompt to your image generation AI. Once you have the image, tell me the file path and I'll add it to the documentation."

### Step 5: Wait for image path

When the user provides the image path:
1. Copy/move the image to the appropriate location in assets/images/
2. Add the image to the documentation file at an appropriate location (usually near the top, after the title/intro)
3. Use markdown image syntax without width constraints: `![Infographic description](../assets/images/filename.png)`

Confirm the image was added to the doc.
