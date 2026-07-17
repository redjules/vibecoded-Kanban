# Scripts

This directory contains developer wrappers around Docker Compose:

- `start.sh` and `stop.sh` support macOS and Linux.
- `start.ps1` and `stop.ps1` support Windows PowerShell.

Run scripts from any working directory. They resolve the repository root and invoke the root `compose.yaml`. Keep these scripts limited to starting and stopping the local development stack.
