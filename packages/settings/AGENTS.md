# @canopy/settings

Settings cascade resolution (node → type → namespace → global → schema default) and `UserSetting` node creation.

## Allowed dependencies

`@canopy/graph` only.

## Forbidden

- No I/O, no React.
- Settings are stored as nodes; do not introduce a separate setting store.
