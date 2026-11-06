# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connector-states.test.ts >> LinkedIn connection moves from disconnected through sign-in to verified and persists
- Location: tests\connector-states.test.ts:9:5

# Error details

```
Test timeout of 45000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=f2e1]:
  - generic [ref=f2e3]:
    - generic [ref=f2e5]:
      - generic [ref=f2e7]:
        - paragraph [ref=f2e8]: Utomator / Studio
        - paragraph [ref=f2e9]: Local automation, evidence first
      - generic [ref=f2e10]:
        - status "Connecting to the engine" [ref=f2e11]
        - button "Account menu" [ref=f2e15] [cursor=pointer]:
          - generic [ref=f2e16]: A
    - generic [ref=f2e18]:
      - complementary [ref=f2e19]:
        - generic [ref=f2e20]:
          - button "Workspace" [ref=f2e21]
          - button "Résumés" [ref=f2e24]
          - button "Intelligence" [ref=f2e28]
          - button "Creator research" [ref=f2e32]
          - button "Editorial drafts" [ref=f2e35]
          - button "Growth" [ref=f2e39]
      - main [ref=f2e43]:
        - generic [ref=f2e45]:
          - generic [ref=f2e46]:
            - generic [ref=f2e47]: Artboard / No workflow selected
            - button "Workflow library" [ref=f2e48]
          - generic [ref=f2e54]:
            - paragraph [ref=f2e60]: Your workspace
            - heading "Start with a clear canvas" [level=2] [ref=f2e61]
            - paragraph [ref=f2e62]: Choose a workflow from the library or build your own. The canvas stays empty until you choose to open or create a workflow.
            - generic [ref=f2e63]:
              - button "Browse templates" [ref=f2e64]
              - button "Create new workflow" [ref=f2e71]
            - paragraph [ref=f2e75]: New executable workflows begin with the four required Runner stages. You can add and configure steps before saving.
        - button "Connect LinkedIn account" [active] [ref=f2e76]
      - complementary [ref=f2e86]:
        - generic [ref=f2e87]:
          - generic [ref=f2e88]:
            - button "New conversation Workspace No earlier threads" [ref=f2e90] [cursor=pointer]:
              - generic [ref=f2e94]:
                - generic [ref=f2e95]: New conversation
                - generic [ref=f2e96]:
                  - generic [ref=f2e97]: Workspace
                  - generic [ref=f2e98]: No earlier threads
            - button "Hide Mator chat" [ref=f2e99] [cursor=pointer]
          - region "Thread history" [ref=f2e103]:
            - log [ref=f2e104]:
              - generic [ref=f2e105]:
                - generic [ref=f2e113]:
                  - paragraph [ref=f2e114]: What would you like to do?
                  - paragraph [ref=f2e115]: Ask Mator for help with this workflow, or start with a suggestion.
                - generic [ref=f2e116]:
                  - button "Audit my profile" [ref=f2e117] [cursor=pointer]
                  - button "Change my headline" [ref=f2e118] [cursor=pointer]
                  - button "Add a skill" [ref=f2e119] [cursor=pointer]
                  - button "Draft a post" [ref=f2e120] [cursor=pointer]
          - generic [ref=f2e122]:
            - generic [ref=f2e123]:
              - textbox "Message Mator" [ref=f2e124]:
                - /placeholder: Message Mator…
              - generic [ref=f2e125]:
                - button "Attach a file" [ref=f2e126] [cursor=pointer]
                - button [aria-hidden] [ref=f2e129]
                - button "Dictate into text draft" [ref=f2e130] [cursor=pointer]
                - generic [ref=f2e134]:
                  - generic "Voice-only conversation" [ref=f2e135]:
                    - switch "Mator AI Call mode" [ref=f2e136] [cursor=pointer]
                  - button "Chat settings" [ref=f2e138] [cursor=pointer]
                  - button "Send message" [disabled] [ref=f2e143]
            - generic [ref=f2e146]: Enter sends · Shift+Enter adds a line
  - button "Open Next.js Dev Tools" [ref=f2e157] [cursor=pointer]
  - alert [ref=f2e161]
```