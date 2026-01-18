### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [0.4.7](https://github.com/karmaniverous/stan-core/compare/0.4.6...0.4.7)

- test: hoist classifier/fs exports for SSR [`14db59e`](https://github.com/karmaniverous/stan-core/commit/14db59e5e5f9eacf8610447720105ad14e082a82)
- docs: add assistant guide policy to system prompt [`81487f7`](https://github.com/karmaniverous/stan-core/commit/81487f710f144793a0c078a43a45c0516dd6890a)
- docs: add stan assistant guide [`e73ec14`](https://github.com/karmaniverous/stan-core/commit/e73ec142137d8b737ca0cd4b1125516d0249bc3a)
- test: hoist exports to stabilize Vitest SSR [`bd41ed9`](https://github.com/karmaniverous/stan-core/commit/bd41ed982ab9c951f2b75df407aec0ab763ecf57)

#### [0.4.6](https://github.com/karmaniverous/stan-core/compare/0.4.5...0.4.6)

> 5 November 2025

- chore: release v0.4.6 [`3ace057`](https://github.com/karmaniverous/stan-core/commit/3ace0571b9c5381e09058761d2569021b52da2c8)
- Eliminate invalid wrappers [`6ca77c8`](https://github.com/karmaniverous/stan-core/commit/6ca77c85dd24128c98a2861fd6e4df2b72573f27)

#### [0.4.5](https://github.com/karmaniverous/stan-core/compare/0.4.4...0.4.5)

> 27 October 2025

- fix: stabilize SSR classifier import and use static eslint-config-prettier [`2a0afb3`](https://github.com/karmaniverous/stan-core/commit/2a0afb32c5db2e0455f5170396228787d5f2d82f)
- chore: release v0.4.5 [`b9063b1`](https://github.com/karmaniverous/stan-core/commit/b9063b15d75166aea7138330d5261430cf055268)

#### [0.4.4](https://github.com/karmaniverous/stan-core/compare/0.4.3...0.4.4)

> 25 October 2025

- chore: release v0.4.4 [`1bd34c3`](https://github.com/karmaniverous/stan-core/commit/1bd34c3facd582d9be11bcd24b967650a57bc719)
- updated docs [`9a63a45`](https://github.com/karmaniverous/stan-core/commit/9a63a4536ef3788598af11dbe0b0ef9bb262d3be)
- interop & todo cleanup [`fd8ee44`](https://github.com/karmaniverous/stan-core/commit/fd8ee44e929b8e77e25180b789901cf6d9cea84a)
- fix: preserve .stan path on creation fallback [`53a7a4e`](https://github.com/karmaniverous/stan-core/commit/53a7a4eb991a6d4fa2d2fde418257d652fb62f6c)
- interop [`f7ce416`](https://github.com/karmaniverous/stan-core/commit/f7ce416fa1ffae69fd74de011b33e87f1ed78bcf)
- test: stabilize SSR-sensitive test imports (tar capture, jsdiff) [`448f84c`](https://github.com/karmaniverous/stan-core/commit/448f84c1ac489028a5336da5547288f08eaf198d)
- test: stabilize config discovery test import under Vitest SSR [`6e552fc`](https://github.com/karmaniverous/stan-core/commit/6e552fce9484bdd7fb9ac557a5a37580f892e6de)
- test: fix config discovery test write helper usage [`9b26199`](https://github.com/karmaniverous/stan-core/commit/9b26199f6c34fd2d6661d5e55b610ba52c119a43)

#### [0.4.3](https://github.com/karmaniverous/stan-core/compare/0.4.2...0.4.3)

> 24 October 2025

- chore(eslint): migrate to typed flat eslint.config.ts [`1765211`](https://github.com/karmaniverous/stan-core/commit/17652115d3de9883c0c2ed05d40d62e1a093aace)
- refactor(lint): finish strict typed ESLint cleanup (no-unnecessary-condition) [`365845e`](https://github.com/karmaniverous/stan-core/commit/365845ef0f4cc25075af9354c6dc9edfad35ede2)
- docs: record strict typed ESLint policy [`6eec305`](https://github.com/karmaniverous/stan-core/commit/6eec3052c144d822bede5543181465dbb20bea06)
- chore: release v0.4.3 [`435b4d8`](https://github.com/karmaniverous/stan-core/commit/435b4d8a1945aec2b556a076715067b3fa414e2a)
- chore(lint): integrate @vitest/eslint-plugin (recommended rules) [`378159b`](https://github.com/karmaniverous/stan-core/commit/378159bb6af4664c6b226297f675941f69a8ee14)
- chore(eslint): fix typed flat config (ts-safe) and JSONC types; keep prior rule parity [`200338d`](https://github.com/karmaniverous/stan-core/commit/200338dec59ac466a7969810a7516d86e237a0fb)
- refactor(lint): fix strict typed ESLint findings across code and tests [`0feae9e`](https://github.com/karmaniverous/stan-core/commit/0feae9ed0807d88c0ff207a8133c278072c0135a)
- test(config): inline YAML write in config.load.extra.test to fix runtime import [`97e74f5`](https://github.com/karmaniverous/stan-core/commit/97e74f5988199a1600e1677f20cc628b7b444078)
- refactor: DRY makeStanDirs usage; export default from paths [`45b493a`](https://github.com/karmaniverous/stan-core/commit/45b493a8ac4c550a0d0a0abc9e8a6a5d0146b445)
- fix: SSR-safe makeStanDirs import fallback in fs.ts [`249dbbf`](https://github.com/karmaniverous/stan-core/commit/249dbbfe0f80b02d68a31890a75555c57e401cec)
- chore(eslint): finalize typed flat config; scope TS rules; add momoa shim [`04f10b8`](https://github.com/karmaniverous/stan-core/commit/04f10b8342fe04dbd4d42f5fc82476afdc82b2d4)
- docs: add SSR-friendly dynamic import pattern to requirements [`15c10e0`](https://github.com/karmaniverous/stan-core/commit/15c10e0451cd93fc321837bc2d7ac8459bb7dd13)
- chore(eslint): remove @eslint/core type imports; scope presets; enable skipLibCheck [`c8a3b42`](https://github.com/karmaniverous/stan-core/commit/c8a3b42c58102c87d995d0e69967027d317836fa)
- refactor(lint): finalize strict typed ESLint in validator [`7680c0d`](https://github.com/karmaniverous/stan-core/commit/7680c0de38d3ab38341d6c1c8d6f4074b8f68a96)
- test: stabilize createArchiveDiff import under Vitest SSR [`12ce38e`](https://github.com/karmaniverous/stan-core/commit/12ce38e9bd4e161b7e8271711bc92d4710a1b4f3)

#### [0.4.2](https://github.com/karmaniverous/stan-core/compare/0.4.1...0.4.2)

> 18 October 2025

- docs: add stanPath write‑time discipline to system prompt [`2aae47e`](https://github.com/karmaniverous/stan-core/commit/2aae47ed80eadaa3c1475f5a6bc078e94a76f5bc)
- chore: release v0.4.2 [`adc1b30`](https://github.com/karmaniverous/stan-core/commit/adc1b309755800b8ee3b5ce3147854a4c078b34b)
- docs: enforce dev plan “Completed” append-only with pre-send validation [`f56c4a4`](https://github.com/karmaniverous/stan-core/commit/f56c4a43588228d9d858d1f4394d7f757cf619fe)

#### [0.4.1](https://github.com/karmaniverous/stan-core/compare/0.4.0...0.4.1)

> 18 October 2025

- interop [`b62f184`](https://github.com/karmaniverous/stan-core/commit/b62f1840b320e1753f6eae95993078ef9670b79e)
- chore: release v0.4.1 [`ecc8c6a`](https://github.com/karmaniverous/stan-core/commit/ecc8c6a827f9b2cad29adb4362ec87b8242b60f6)
- docs: add facet‑aware editing guard to system prompt [`ae3eee3`](https://github.com/karmaniverous/stan-core/commit/ae3eee3ef17a43f1abcee0ac90cbce02a686cb70)

#### [0.4.0](https://github.com/karmaniverous/stan-core/compare/0.3.0...0.4.0)

> 17 October 2025

- test(core): deflake packaged prompt cwd resolution by consolidating tests [`deaab6c`](https://github.com/karmaniverous/stan-core/commit/deaab6c1254ff863488e5034b754c43a3d0abd8d)
- test(prompt): assert packaged prompt resolution independent of cwd [`4ab3d26`](https://github.com/karmaniverous/stan-core/commit/4ab3d26867d33b1d76adaa725d04bb989beeb4e1)
- feat(core/docs): export makeGlobMatcher helper and document selection precedence [`4f5081e`](https://github.com/karmaniverous/stan-core/commit/4f5081efa319d8478caecfc9c857ed464a9bbdaa)
- chore: release v0.4.0 [`75e15aa`](https://github.com/karmaniverous/stan-core/commit/75e15aa66c52b7503509ccbab94e45971dbdc555)
- interop(core↔cli): facet overlay response + minimal anchors hook proposal [`6242e01`](https://github.com/karmaniverous/stan-core/commit/6242e016463492f3f9978c5b8e724d96a7679583)
- interop cleanup [`7d46592`](https://github.com/karmaniverous/stan-core/commit/7d465928e5d9e589e0db5c525c2328e59b8d9e16)
- feat(core): add anchors channel to selection surfaces + tests [`dd71f1f`](https://github.com/karmaniverous/stan-core/commit/dd71f1fabb2a456d898fae6315acbe75166a5b62)
- test: adopt shared tar capture helper across archive/diff suites [`5c6135e`](https://github.com/karmaniverous/stan-core/commit/5c6135e6941d6442e158983aa066ea5ac590f0e1)
- docs: prune and update dev plan (DRY complete) [`3d5e026`](https://github.com/karmaniverous/stan-core/commit/3d5e0268efddf90afaaee755b297a5ec24b630c8)
- interop(cli): archive overlay metadata contract [`2ccc600`](https://github.com/karmaniverous/stan-core/commit/2ccc6005bc0c8a3134a90252c4dbd82282044538)
- test(helpers,docs): add shared config/tar helpers and migration note [`e01c5d0`](https://github.com/karmaniverous/stan-core/commit/e01c5d0cdd31cd5d609f651f07a5808a475602bd)
- docs(core): facets overlay guidance + anchors channel in requirements and plan [`07d8d2a`](https://github.com/karmaniverous/stan-core/commit/07d8d2a99dff16b90816445b029c63332f5e0ec3)
- docs(test): add Typedoc examples for anchors and finish DRY follow‑through [`2f03db6`](https://github.com/karmaniverous/stan-core/commit/2f03db64f1cc5ca1dac7980ee8f8d3c97e62b1c3)
- test(config): strict stan-core schema and JSON-path error diagnostics [`81f98d0`](https://github.com/karmaniverous/stan-core/commit/81f98d06e593492c34b8658e40468a97a3c0b89d)
- chore(plan): prune completed Next up items and add helper adoption follow‑through [`5bb53bf`](https://github.com/karmaniverous/stan-core/commit/5bb53bf5eb6ee435b156061758e6ff197128090c)
- test: adopt config helpers in discovery/load suites [`a987dd1`](https://github.com/karmaniverous/stan-core/commit/a987dd1260f7fcae09b877bb38bc217f743994d5)
- test: fix tar mock hoisting in withMockTarCapture [`1c31dad`](https://github.com/karmaniverous/stan-core/commit/1c31dadad18eac086fa6fb6ab67bc237efef34df)
- test(helpers): fix tar mock hoisting via vi.hoisted() to resolve “calls is not defined” [`63bbb16`](https://github.com/karmaniverous/stan-core/commit/63bbb166ebff1cbc5e2fde334e752244190dae34)
- reordered dependencies [`630c041`](https://github.com/karmaniverous/stan-core/commit/630c04155c0a45f2aa6b45b532accd2f48b8adad)

#### [0.3.0](https://github.com/karmaniverous/stan-core/compare/0.3.0-0...0.3.0)

> 12 October 2025

- chore: prune resolved interop notes after CLI namespacing [`548b472`](https://github.com/karmaniverous/stan-core/commit/548b472d09bec72cc6252b6028d7bd6541e75b12)
- chore: release v0.3.0 [`5f58467`](https://github.com/karmaniverous/stan-core/commit/5f584678e5201c470e6b077727e0f40c9e6f8535)
- refactor: DRY set 2 — shared diff/EOL/config helpers; small consolidations [`d1ab11f`](https://github.com/karmaniverous/stan-core/commit/d1ab11f623d2897ea8fd006ae13e46196ef7a9e9)
- refactor: DRY helpers for file-ops, repo paths, jsdiff writes, and archive composition [`21220a1`](https://github.com/karmaniverous/stan-core/commit/21220a1a77e6c838a66c6fcd2cf6645347b6d95d)
- docs(core): align docs to namespaced config; add ENV guide [`05c7e07`](https://github.com/karmaniverous/stan-core/commit/05c7e0715bfdfc0e13f36f36513eb8d4fc431853)
- chore(plan): update Next up for post-namespacing follow-through [`fd04a1c`](https://github.com/karmaniverous/stan-core/commit/fd04a1c0867d165e62456395b2d44fd59cbee4b2)
- docs(todo): prune Completed to recent, high-signal entries [`8acf295`](https://github.com/karmaniverous/stan-core/commit/8acf2952f40809d885f697fa07dfedb31191f4c8)
- docs(build): eliminate Typedoc warning by exporting AttemptCapture [`baf06d7`](https://github.com/karmaniverous/stan-core/commit/baf06d737f8676c6d3220c2ef4dafd4e41db05a7)

#### [0.3.0-0](https://github.com/karmaniverous/stan-core/compare/0.2.0...0.3.0-0)

> 11 October 2025

- core: slim config schema; tolerate unknown keys [`bc1c443`](https://github.com/karmaniverous/stan-core/commit/bc1c4433b6148c9e4365307ad11d185408f57314)
- chore: release v0.3.0-0 [`62b0d99`](https://github.com/karmaniverous/stan-core/commit/62b0d99db92a875558db718b04abf1c26eacf328)
- docs: adopt namespaced config (stan-core / stan-cli); update plan & interop [`e96d6f5`](https://github.com/karmaniverous/stan-core/commit/e96d6f551e4efd03ddf2e68336ee57dad869cff7)
- stan run [`32c460b`](https://github.com/karmaniverous/stan-core/commit/32c460b06f3faa5a509020a7626b15034149b669)
- core: adopt strict namespaced config (stan-core); drop CLI normalization [`b9ac2f8`](https://github.com/karmaniverous/stan-core/commit/b9ac2f8854dbb6541dbddaed5bbc4f03e15c3207)

#### [0.2.0](https://github.com/karmaniverous/stan-core/compare/0.1.3...0.2.0)

> 11 October 2025

- docs(project): add Zod schema/type naming convention [`f37f7ff`](https://github.com/karmaniverous/stan-core/commit/f37f7ffd9096a5d8dcfa8b13ee14deb361f482e9)
- docs(dev-plan): append-only Completed, no timestamp, no numbering; Completed last [`87e73d1`](https://github.com/karmaniverous/stan-core/commit/87e73d198089573219f56e8342ac49d5608f5b26)
- chore(interop): post core-config slimming + CLI config extraction plan/code to stan-cli [`f33a448`](https://github.com/karmaniverous/stan-core/commit/f33a448ad82e4682a22118b02cfa8e1d79da9f24)
- chore: release v0.2.0 [`bdacd03`](https://github.com/karmaniverous/stan-core/commit/bdacd03af51d97f50931d90fb59e4c494d9fd5e2)

#### [0.1.3](https://github.com/karmaniverous/stan-core/compare/0.1.1...0.1.3)

> 9 October 2025

- docs(system): clarify diagnostics and post‑patch listing [`faa23b2`](https://github.com/karmaniverous/stan-core/commit/faa23b2c7e7b7dc95e78e94bd1a2303af66e1f7c)
- chore: release v0.1.3 [`9e77d7f`](https://github.com/karmaniverous/stan-core/commit/9e77d7f0e01f2ea28575f6f92581f8b1add8a535)
- fixed system prompt generator & updated prompt [`349e1d4`](https://github.com/karmaniverous/stan-core/commit/349e1d4e8d5e9939935cc762cf8d99fa86d3591e)
- docs(system): make diagnostics listings mandatory; remove legacy “optional on request” [`40ab4dc`](https://github.com/karmaniverous/stan-core/commit/40ab4dc50b272c96bf667eefbc978c46b539ce12)

#### [0.1.1](https://github.com/karmaniverous/stan-core/compare/0.1.0...0.1.1)

> 7 October 2025

- docs(system): 300‑LOC hard gate + decomposition; diagnostics = listings only [`7363cd6`](https://github.com/karmaniverous/stan-core/commit/7363cd68b74e0fbb06dad7f0f1907c82d1eb05c3)
- chore: release v0.1.1 [`e7815da`](https://github.com/karmaniverous/stan-core/commit/e7815dac4f3678352791d4829c467cf82cb06525)

#### 0.1.0

> 6 October 2025

- Initial commit [`1494037`](https://github.com/karmaniverous/stan-core/commit/1494037cdc692696f4fd4eecfdecdf0b5d6a5ea1)
- chore(core): remove CLI adapters/runner and CLI-only deps from stan-core [`13f0e9e`](https://github.com/karmaniverous/stan-core/commit/13f0e9eea4a2f000397d8edce500493548d3d5e8)
- renamed repo & updated version [`2e447bc`](https://github.com/karmaniverous/stan-core/commit/2e447bc23bc705c9d6da890706c947cf4160af3e)
- chore: release v0.1.0 [`df558ba`](https://github.com/karmaniverous/stan-core/commit/df558ba5d49dce4afc8fcf6b92dacc9d681694ee)
- docs(core/cli): swappable core + interop threads [`cea12e3`](https://github.com/karmaniverous/stan-core/commit/cea12e3b9eb9e3b9dfc9ea7dbffcd0935d23e68f)
- docs(core): prune CLI content; converge requirements and plan on stan-core [`f81d10f`](https://github.com/karmaniverous/stan-core/commit/f81d10f41e3ceabd6e6e9be157c3295d5ab48899)
- updated dependencies [`3dbb202`](https://github.com/karmaniverous/stan-core/commit/3dbb20200388b65078a10187e41d5f36c1d8bdfd)
- feat(core): export patch/imports; update README [`5877692`](https://github.com/karmaniverous/stan-core/commit/58776928481adc66fb92cb1ce42ae44976957fa9)
- refactor(core): remove presentation helpers; export CORE_VERSION; fix TSDoc [`dde1c6a`](https://github.com/karmaniverous/stan-core/commit/dde1c6a040ff0a0c5aac58de28f29b75311cc719)
- chore(core): remove readPatchSource; move acquisition to CLI [`57cb5be`](https://github.com/karmaniverous/stan-core/commit/57cb5be140b26f1de1daf7f1c310dafb2ad159d7)
- feat(patch): creation-fallback; docs: re-export public types [`b9d4f44`](https://github.com/karmaniverous/stan-core/commit/b9d4f44bdeb859b35609bcaf370be77e6037b729)
- refactor(core): surface archive/imports notes via callbacks; remove console I/O [`2f182d4`](https://github.com/karmaniverous/stan-core/commit/2f182d4626af92823e61800c0c1e34e3ad7fb619)
- chore(knip+interop): ignore unused helpers; ask CLI if needed [`958d986`](https://github.com/karmaniverous/stan-core/commit/958d98664736caae48cff395a7ce6b7a8da4bc50)
- fix(config): align Zod v4 record + scripts typing [`bcc1164`](https://github.com/karmaniverous/stan-core/commit/bcc11642fa8609a574c81672958d54a8f2c1dd00)
- chore(core): add interop notes for stan-cli safe deletions [`3228fae`](https://github.com/karmaniverous/stan-core/commit/3228fae069b32ab292f75d2dc09ccea4510fdb4f)
- chore(interop): confirm top-level exports for stan-cli wiring [`5bd4470`](https://github.com/karmaniverous/stan-core/commit/5bd44709914e9c3591e89e4bd780cfff3938704b)
- refactor(core): remove clipboard import; inject clipboardRead [`5160037`](https://github.com/karmaniverous/stan-core/commit/5160037ca360e581eaef2282ce8978ad6aafc1d5)
- chore(plan): advance core/CLI decomposition and console‑free surfaces [`7b1e795`](https://github.com/karmaniverous/stan-core/commit/7b1e7957911342723aa6a706217e98421c0e3731)
- refactor(core): inject clipboard read into patch source; remove clipboard dep from engine [`1b967f1`](https://github.com/karmaniverous/stan-core/commit/1b967f1bdd1a36c3ab5f544e131d3df85ee121ae)
- chore(core): finalize top-level exports and types path for CLI wiring [`2046003`](https://github.com/karmaniverous/stan-core/commit/2046003b021abea400ebd21a7e409660184362d8)
- fix(config): normalize scripts type-mismatch message [`df0bc32`](https://github.com/karmaniverous/stan-core/commit/df0bc3283f5947176d0446ef65fbb4701f958ea9)
- chore(lint/docs): fix tsdoc/regex lint; re-export ApplyResult for docs [`dd8cad0`](https://github.com/karmaniverous/stan-core/commit/dd8cad035629fd007bf7686848fd933583eec959)
