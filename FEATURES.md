# Features / TODO

- [x] Optionally copy html files to extension-less versions (eg 'blog.html' to 'blog' to support Next.js static export without relying on trailing slash nor relying on a lambda to rewrite urls)
- [x] Only sync changed files based on contents hash
- [x] Only invalidate cache for changed HTML files
- [x] Support certain jobs in the pipelines from forked PRs
  - See: if: github.event.pull_request.head.repo.full_name == github.repository
  - Don't do any AWS stuff if PR from fork
- [x] Optionally delete Preview site when PR is closed
- [x] Optional stack creation (useful to bypass when `repository_dispatch` is used to build & deploy from external system)
- [ ] Fix compression for preview sites
- [ ] Use origin-request instead of viewer-request for the preview lambda?
- [ ] Support repository_dispatch & workflow_dispatch
- [x] Update license and codeowners
