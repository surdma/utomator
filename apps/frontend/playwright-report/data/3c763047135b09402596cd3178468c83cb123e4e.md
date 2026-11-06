# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connector-sync.test.ts >> Legacy duplicate accounts require deliberate cleanup, not selection for workflows
- Location: tests\connector-sync.test.ts:45:5

# Error details

```
Tearing down "context" exceeded the test timeout of 45000ms.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e7]:
        - paragraph [ref=e8]: Utomator / Studio
        - paragraph [ref=e9]: Local automation, evidence first
      - generic [ref=e10]:
        - status "Engine connected" [ref=e11]
        - button "Account menu" [ref=e15] [cursor=pointer]
    - generic [ref=e18]:
      - complementary [ref=e19]:
        - generic [ref=e20]:
          - button "Workspace" [ref=e21]
          - button "Résumés" [ref=e24]
          - button "Intelligence" [ref=e28]
          - button "Creator research" [ref=e32]
          - button "Editorial drafts" [ref=e35]
          - button "Growth" [ref=e39]
      - main [ref=e43]:
        - dialog [ref=e44]:
          - generic [ref=e45]:
            - heading "Connect your social accounts" [level=2] [ref=e47]
            - button "Close Connect your social accounts" [active] [ref=e48]
          - generic [ref=e53]:
            - region [ref=e54]:
              - heading "Select a network" [level=3] [ref=e56]
              - generic "Social networks" [ref=e57]:
                - button "LinkedIn" [pressed] [ref=e58]
                - button "X" [ref=e66]
            - region "LinkedIn connection" [ref=e70]:
              - generic [ref=e71]:
                - heading "LinkedIn" [level=3] [ref=e73]
                - generic [ref=e74]: Not connected
              - generic [ref=e75]:
                - generic [ref=e76]:
                  - text: Legacy linked accounts
                  - combobox "Legacy linked account" [ref=e77]:
                    - option "First LinkedIn (@first-owner)" [selected]
                    - option "Second LinkedIn (@second-owner)"
                - alert [ref=e78]: Legacy duplicates detected. Remove the extra identities from your profile before linking a replacement.
                - generic [ref=e79]:
                  - paragraph [ref=e80]: First LinkedIn
                  - paragraph [ref=e81]: "@first-owner"
                  - paragraph [ref=e82]: This account needs a verified session before workflows can run.
                - button "Connect LinkedIn" [ref=e84]
                - paragraph [ref=e86]: Isolated Chrome mode uses a separate browser profile. To reuse a Chrome login, opt in to local Chrome attachment.
                - button "Manage profiles" [ref=e87]
            - region "Additional social networks" [ref=e88]:
              - button "Other networks Coming soon" [ref=e89]:
                - generic [ref=e90]: Other networks
                - generic [ref=e91]: Coming soon
            - paragraph [ref=e92]: Utomator does not collect your social password. Local Chrome attachment is optional. Hosted and mobile connections require supported provider authorization; workflows still require your review.
        - generic [ref=e94]:
          - generic [ref=e95]:
            - generic [ref=e96]: Artboard / No workflow selected
            - button "Workflow library" [ref=e97]
          - generic [ref=e103]:
            - paragraph [ref=e109]: Your workspace
            - heading "Start with a clear canvas" [level=2] [ref=e110]
            - paragraph [ref=e111]: Choose a workflow from the library or build your own. The canvas stays empty until you choose to open or create a workflow.
            - generic [ref=e112]:
              - button "Browse templates" [ref=e113]
              - button "Create new workflow" [ref=e120]
            - paragraph [ref=e124]: New executable workflows begin with the four required Runner stages. You can add and configure steps before saving.
          - generic [ref=e125]:
            - generic [ref=e126]: Continue a saved workflow
            - generic [ref=e129]:
              - button "Profile baseline and evidence 11 steps · Revision 1" [ref=e130]:
                - generic [ref=e131]: Profile baseline and evidence
                - generic [ref=e132]: 11 steps · Revision 1
              - button "Profile baseline and evidence 11 steps · Revision 1" [ref=e133]:
                - generic [ref=e134]: Profile baseline and evidence
                - generic [ref=e135]: 11 steps · Revision 1
              - button "Section-specific profile audit 10 steps · Revision 1" [ref=e136]:
                - generic [ref=e137]: Section-specific profile audit
                - generic [ref=e138]: 10 steps · Revision 1
              - button "Profile baseline and evidence 11 steps · Revision 1" [ref=e139]:
                - generic [ref=e140]: Profile baseline and evidence
                - generic [ref=e141]: 11 steps · Revision 1
        - button "Connect LinkedIn account" [ref=e142]
      - complementary [ref=e152]:
        - generic [ref=e153]:
          - generic [ref=e154]:
            - button "New conversation Workspace No earlier threads" [ref=e156] [cursor=pointer]:
              - generic [ref=e160]:
                - generic [ref=e161]: New conversation
                - generic [ref=e162]:
                  - generic [ref=e163]: Workspace
                  - generic [ref=e164]: No earlier threads
            - button "Hide Mator chat" [ref=e165] [cursor=pointer]
          - region "Thread history" [ref=e169]:
            - log [ref=e170]:
              - generic [ref=e171]:
                - generic [ref=e179]:
                  - paragraph [ref=e180]: What would you like to do?
                  - paragraph [ref=e181]: Ask Mator for help with this workflow, or start with a suggestion.
                - generic [ref=e182]:
                  - button "Audit my profile" [ref=e183] [cursor=pointer]
                  - button "Change my headline" [ref=e184] [cursor=pointer]
                  - button "Add a skill" [ref=e185] [cursor=pointer]
                  - button "Draft a post" [ref=e186] [cursor=pointer]
          - generic [ref=e188]:
            - generic [ref=e189]:
              - textbox "Message Mator" [ref=e190]:
                - /placeholder: Message Mator…
              - generic [ref=e191]:
                - button "Attach a file" [ref=e192] [cursor=pointer]
                - button [aria-hidden] [ref=e195]
                - button "Dictate into text draft" [ref=e196] [cursor=pointer]
                - generic [ref=e200]:
                  - generic "Voice-only conversation" [ref=e201]:
                    - switch "Mator AI Call mode" [ref=e202] [cursor=pointer]
                  - button "Chat settings" [ref=e204] [cursor=pointer]
                  - 'button "Chat model: Fast reasoning chat" [ref=e210] [cursor=pointer]'
                  - button "Send message" [disabled] [ref=e216]
            - generic [ref=e219]: Enter sends · Shift+Enter adds a line
  - button "Open Next.js Dev Tools" [ref=e230] [cursor=pointer]:
    - generic [ref=e233]:
      - text: Compiling
      - generic [ref=e234]:
        - generic [ref=e235]: .
        - generic [ref=e236]: .
        - generic [ref=e237]: .
  - alert [ref=e238]
```