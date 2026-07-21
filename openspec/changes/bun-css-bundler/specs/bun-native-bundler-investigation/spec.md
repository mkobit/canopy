## ADDED Requirements

### Requirement: compile Tailwind CSS v4 in-process
the build system SHALL compile Tailwind CSS v4 directives inside CSS files in-process during bundling without requiring a separate background watch command.

#### Scenario: compile tailwind directives
- **WHEN** compiler bundles the CSS stylesheet containing `@import "tailwindcss";`
- **THEN** final output stylesheet contains fully compiled utility classes

### Requirement: externalize font assets
the build system SHALL prevent font files referenced in CSS files from being encoded as Base64 data URLs.

#### Scenario: font externalization
- **WHEN** compiler processes `@font-face` rules with woff or woff2 references
- **THEN** output CSS retains relative url paths instead of inlined Base64 data strings

### Requirement: copy external font files
the build system SHALL copy all referenced external font files from `node_modules` to the output folder.

#### Scenario: font asset copy
- **WHEN** bundle completes successfully
- **THEN** all compiled font files are present in the output folder and match their source size
