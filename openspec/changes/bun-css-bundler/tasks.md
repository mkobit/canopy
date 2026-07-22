## 1. Investigation and Feasibility Analysis

- [ ] 1.1 Spike test custom PostCSS and Tailwind v4 onload compilation inside `Bun.build`
- [ ] 1.2 Spike test marking font assets as external in onResolve to prevent Base64 inlining
- [ ] 1.3 Implement copy logic in onEnd hook to move externalized font files to output directory
- [ ] 1.4 Benchmark build size, build speed, and developer experience against Vite baseline

## 2. Documentation and OpenSpec Creation

- [ ] 2.1 Write OpenSpec proposal and design documents outlining the custom plugin configuration
- [ ] 2.2 Define success metrics and document the recommendation to retain Vite for now
- [ ] 2.3 Commit and close the `bun-css-bundler` OpenSpec proposal
