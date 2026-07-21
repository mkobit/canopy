## ADDED Requirements

### Requirement: Bun build compiles the web application
The build command SHALL compile `apps/web` into a production-ready client bundle natively using `Bun.build` or a Bun build script, without invoking Vite.

#### Scenario: Production compilation succeeds
- **WHEN** the build command runs
- **THEN** it compiles the entrypoint `src/main.tsx` and outputs static bundle files to the `dist/` directory and exits 0

### Requirement: Bun dev server runs natively
The dev command SHALL start a development server natively under Bun that serves the compiled assets.

#### Scenario: Development server starts
- **WHEN** the dev command runs
- **THEN** the server starts listening on an HTTP port, resolves JavaScript, HTML, and CSS files, and serves them

### Requirement: Tailwind CSS compilation
The build pipeline SHALL process Tailwind CSS directives and compile them into CSS output using Tailwind CSS v4's native CLI or a compatible Tailwind compiler.

#### Scenario: Tailwind CSS compiles correctly
- **WHEN** the CSS build step runs
- **THEN** the Tailwind `@import "tailwindcss";` directive is compiled into CSS utility classes and output to the dist directory

### Requirement: Asset resolution for fonts and images
The build pipeline SHALL resolve and bundle fonts and image assets imported in CSS or JavaScript files, copying them to the output directory and updating their asset URLs.

#### Scenario: Fonts and assets copy to dist
- **WHEN** font files are imported via `@fontsource/*` in CSS
- **THEN** the compiler copies the `.woff`/`.woff2` files to the output assets directory and replaces the import URLs with the hashed output path
