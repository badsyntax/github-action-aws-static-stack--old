# Features / TODO

- [x] Optionally copy html files to extension-less versions (eg 'blog.html' to 'blog' to support Next.js static export without relying on trailing slash nor relying on a lambda to rewrite urls)
- [x] Only sync changed files based on contents hash
- [x] Only invalidate cache for changed HTML files
- [ ] Support certain jobs in the pipelines from forked PRs
  - See: if: github.event.pull_request.head.repo.full_name == github.repository
  - Don't do any AWS stuff if PR from fork
- [ ] Optionally delete Preview site when PR is closed
- [ ] Fix compression for preview sites
- [ ] Use origin-request instead of viewer-request for the preview lambda?
- [ ] Update license and codeowners
- [ ] Support repository_dispatch & workflow_dispatch
