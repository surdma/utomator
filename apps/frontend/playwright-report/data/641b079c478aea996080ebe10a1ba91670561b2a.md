# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connector-sync.test.ts >> Only LinkedIn is shown; account state remains server-owned across reloads
- Location: tests\connector-sync.test.ts:9:5

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Tearing down "context" exceeded the test timeout of 45000ms.
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - generic [ref=f1e5]:
    - generic [ref=f1e7]:
      - paragraph [ref=f1e8]: Utomator / Studio
      - paragraph [ref=f1e9]: Local automation, evidence first
    - generic [ref=f1e10]:
      - status "Connecting to the engine" [ref=f1e11]
      - button "Account menu" [ref=f1e15] [cursor=pointer]:
        - generic [ref=f1e16]: A
  - generic [ref=f1e18]:
    - complementary [ref=f1e19]:
      - generic [ref=f1e20]:
        - button "Workspace" [ref=f1e21]
        - button "Résumés" [ref=f1e24]
        - button "Intelligence" [ref=f1e28]
        - button "Creator research" [ref=f1e32]
        - button "Editorial drafts" [ref=f1e35]
        - button "Growth" [ref=f1e39]
    - main [ref=f1e43]:
      - generic [ref=f1e45]:
        - generic [ref=f1e46]:
          - generic [ref=f1e47]: Artboard / No workflow selected
          - button "Workflow library" [ref=f1e48]
        - generic [ref=f1e54]:
          - paragraph [ref=f1e60]: Your workspace
          - heading "Start with a clear canvas" [level=2] [ref=f1e61]
          - paragraph [ref=f1e62]: Choose a workflow from the library or build your own. The canvas stays empty until you choose to open or create a workflow.
          - generic [ref=f1e63]:
            - button "Browse templates" [ref=f1e64]
            - button "Create new workflow" [ref=f1e71]
          - paragraph [ref=f1e75]: New executable workflows begin with the four required Runner stages. You can add and configure steps before saving.
      - button "Connect LinkedIn account" [ref=f1e76]
    - complementary [ref=f1e86]:
      - generic [ref=f1e87]:
        - generic [ref=f1e88]:
          - button "New conversation Workspace No earlier threads" [ref=f1e90] [cursor=pointer]:
            - generic [ref=f1e94]:
              - generic [ref=f1e95]: New conversation
              - generic [ref=f1e96]:
                - generic [ref=f1e97]: Workspace
                - generic [ref=f1e98]: No earlier threads
          - button "Hide Mator chat" [ref=f1e99] [cursor=pointer]
        - region "Thread history" [ref=f1e103]:
          - log [ref=f1e104]:
            - generic [ref=f1e105]:
              - generic [ref=f1e113]:
                - paragraph [ref=f1e114]: What would you like to do?
                - paragraph [ref=f1e115]: Ask Mator for help with this workflow, or start with a suggestion.
              - generic [ref=f1e116]:
                - button "Audit my profile" [ref=f1e117] [cursor=pointer]
                - button "Change my headline" [ref=f1e118] [cursor=pointer]
                - button "Add a skill" [ref=f1e119] [cursor=pointer]
                - button "Draft a post" [ref=f1e120] [cursor=pointer]
        - generic [ref=f1e122]:
          - generic [ref=f1e123]:
            - textbox "Message Mator" [ref=f1e124]:
              - /placeholder: Message Mator…
            - generic [ref=f1e125]:
              - button "Attach a file" [ref=f1e126] [cursor=pointer]
              - button [aria-hidden] [ref=f1e129]
              - button "Dictate into text draft" [ref=f1e130] [cursor=pointer]
              - generic [ref=f1e134]:
                - generic "Voice-only conversation" [ref=f1e135]:
                  - switch "Mator AI Call mode" [ref=f1e136] [cursor=pointer]
                - button "Chat settings" [ref=f1e138] [cursor=pointer]
                - button "Send message" [disabled] [ref=f1e143]
          - generic [ref=f1e146]: Enter sends · Shift+Enter adds a line
```