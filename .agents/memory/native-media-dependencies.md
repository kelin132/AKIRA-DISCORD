---
name: Native media dependencies
description: Runtime requirements for the bot's native image-processing packages.
---

Native packages such as `canvas` and `sharp` must be installed with lifecycle scripts enabled, and container images must include their runtime shared libraries.

**Why:** A dependency install with scripts disabled can look successful while plugin loading later fails when a native module is imported; the slim runtime image also needs the libraries that the native bindings dynamically load.

**How to apply:** Preserve normal npm install scripts for deployment and keep the builder/runtime system packages aligned whenever media plugins are changed.