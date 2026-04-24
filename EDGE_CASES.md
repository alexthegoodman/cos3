50 Real Edge Cases You’ll Hit
🌐 Network & Connectivity
User goes offline mid state sync between apps
Network flaps rapidly (online/offline/online in seconds)
Slow 2G/3G causes partial UI hydration
API returns success but data is stale (cache mismatch)
DNS resolves slowly → app appears frozen
Service worker update fails halfway
Two tabs/devices sync conflicting data simultaneously
Background sync fires after user already changed state
CDN serves outdated assets to some users
WebSocket silently drops without reconnect
💾 State & Data Integrity
App crashes mid-write → corrupted local state
Two apps mutate shared data structure differently
Serialization mismatch between apps (interop failure)
User clears browser storage unexpectedly
IndexedDB quota exceeded silently
Partial restore after refresh (UI ≠ actual data)
Undo/redo stack breaks across sessions
Time-based data drift (device clock mismatch)
App reads stale cached state while another updated it
Failed migration after app update
🧩 Interop (Your Core Feature)
App A sends data format App B partially understands
App B updates schema without backward compatibility
Permission revoked mid interop action
Embedded app component crashes inside host app
Circular data dependencies between apps
Cross-app action triggered twice (duplicate execution)
Interop call times out but still executes later
App expects synchronous response but gets async
Malicious or buggy app sends malformed data
Version mismatch between SDKs across apps
🪟 Windowing & Layout
Window resized extremely fast (dragging corner)
App opened on phone → expanded to TV → layout breaks
Split-screen with 3+ apps competing for focus
Virtual keyboard covers critical UI
Ultra-wide or ultra-tall aspect ratios
Window minimized mid animation
Dragging window across displays with different DPI
Z-index conflicts between apps (overlay bugs)
App assumes fixed minimum size and breaks below it
Rotation (portrait ↔ landscape) mid interaction
🎮 Input & Interaction
User switches from touch → mouse → remote instantly
Double input (touch + mouse event both fire)
Long press vs right click inconsistency
Keyboard shortcut conflicts across apps
Input lag causes repeated actions
Focus lost during typing (interop or window switch)
Accessibility tools override default input behavior
Gesture partially completed when state changes
Drag-and-drop between apps fails mid-transfer
Clipboard access denied or inconsistent