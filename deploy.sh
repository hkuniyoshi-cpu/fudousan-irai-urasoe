#!/usr/bin/env bash
# 公開してよいファイルだけを dist/ に集めて Cloudflare Pages へデプロイする。
# リポジトリ直下を丸ごとデプロイすると、社内向けメモ（CITATION-CHECKLIST.md など）まで公開されるため、必ずこのスクリプトを使う。
# functions/ と lib/ は wrangler がこのディレクトリから読んでまとめる（dist には入れない）。
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist
cp index.html site.css favicon.svg ogp.png privacy-policy.html terms.html 404.html robots.txt llms.txt _routes.json dist/
unset CLOUDFLARE_API_TOKEN
if [ "${1:-}" = "--build-only" ]; then exit 0; fi
CI=true WRANGLER_SEND_METRICS=false npx wrangler pages deploy dist --project-name fudousan-irai-urasoe --branch main --commit-dirty=true
