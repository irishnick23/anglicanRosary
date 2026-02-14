# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Overview

Anglican Rosary is a mobile-first prayer guide app for Anglican prayer beads.

This repository contains a single vanilla web app at the root:
- `index.html`
- `app.js`
- `styles.css`

There is no framework and no build step.

## Commands

No install/build process is required.

To run locally, open `index.html` directly in a browser.

## Architecture

Single-file application logic lives in `app.js`:
- **Flow timeline**: `buildFlowTimeline()` interleaves prayer nodes and timed load nodes. Load screens auto-advance after `DEFAULT_LOAD_MS` (7140ms); prayer screens wait for user tap.
- **Session persistence**: `localStorage` keyed by `SESSION_KEY`. Sessions expire after 2 hours (`SESSION_MAX_AGE_MS`). Flow version hashing invalidates stale sessions.
- **Rendering**: Imperative DOM. `renderStart()`, `renderLoad()`, and `renderPrayer()` set `innerHTML`, while `render()` dispatches by session state and node type.
- **Canvas animation**: `startLoadVisual()` draws a 6500-particle 3D cloud on `<canvas>` using `requestAnimationFrame`. Respects `prefers-reduced-motion`.
- **Dev controls**: `DEV_RESET_ENABLED` controls visibility of "Back to start" and skip buttons.

## Prayer Structure

The rosary follows a fixed sequence:
- Apostles' Creed
- Invitatory/Gloria
- 4 "weeks," each containing:
  - Lord's Prayer
  - Mystery
  - 7 Invocations
