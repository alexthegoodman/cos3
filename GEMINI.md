# COS3 / CommonOS 3

A designed OS (best design) and interop platform. Built in chat. Great window management, responsive (phones to TVs). Apps use the SDK which comes with a beautiful UI kit and interop capabilities. 

CommonOS is a high-fidelity OS and interop platform meant to be a responsive WASM PWA written with Rust and wgpu.

I am moving forward with CommonOS as a WASM PWA so it can be used on any device with a browser. That means a lot of platforms are supported. I lose filesystem access, but it doesn't matter because individual apps will be expected to serve their own data (and make it available via interop).

## JavaScript App SDK Requirements (this enables the robust interop capabilities)

- Register App (with unique id like `username.appname.com`)
- Register Data Construct (Share and load saved data) (Dependency Injection?)
- Register Renderers (Share graphical pipelines and functions which render / create meshes)
- Register UI components (Share logical portions of GUI)
- Register Shared Functions
- Needs a clear way of always specifying the target app when using registered things, as it may be any app which leverages the data, renderer, ui, or functions.
- Create Meshes (with any chosen pipeline)
- Create Pipelines (including Compute and dispatch function) (auto-creates bind group layouts and bind groups based on a simplified config)
- Create and Update Buffers (can bind to a Compute pipeline and update in the JavaScript)
- Create and Update Textures
- Create Lighting (point lights, sun) (we use deferred rendering)
- Audio Playback
- Event Callbacks for lifecycle of apps (allow apps to emit Events as well)
- Keyboard, Mouse, and Gamepad Events
- Generate UUID
- Get window size
- XML or JSX-based UI specification? Higher level primitives that will leverage our lower level text and rectangle primitives (otherwise immediate mode style is fine too)
- Uses quickjs

## Rust-Side UI SDK Requirements

Components (not all needed right away):

- Windows (advanced containers with decorations)
- Minimized Window Bar (mini windows with no decorations, in lieu of typical app icon taskbar)
- Inputs (text, number, textarea with wrapping)
- Text (one-line and multi-line)
- Containers (with external and internal positioning settings)
- Images (and dynamic textures provided by wgpu for rendering different scenes into different windows)
- Tabs
- Dropdown

## OS Requirements

- Responsiveness (just need functions which simplify the styling of elements depending on current screen size or browser size, no need for generic mobile styling)
- Show Time and Weather and Stocks and News?
- Notifications (apps can be polled for new notifications periodically?)
- Volume control
- Data Browser (browse all your data from any app you use and do what you want with that data)
- Chat for app control and app creation
- Universal search (searches all data via the data interop)
- App Store (all free for now, basic approvals)
- Continuously enhance the visual aesthetic and improve the UI widget offerings
- Resize UI windows
- Enable auto-size mode for UI windows (usually on TV devices) (ensures that the most recent window takes most space, 2 windows before that take up medium space, and the rest just fill the mini bar row of mini windows at the bottom of the screen)
- Wallpapers (including live shader wallpapers)