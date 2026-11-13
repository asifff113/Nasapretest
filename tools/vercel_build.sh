#!/usr/bin/env bash
# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
# Vercel build: the same steps as .github/workflows/deploy.yml (site + real results + the offline file).
set -euo pipefail
cd web
RESULTS_BASE=./results npm run build
if [ -f ../results/current.json ]; then RESULTS_DIR=../results npm run build:offline; else npm run build:offline; fi
cd ..
mkdir -p web/dist/results
if [ -f results/current.json ]; then
  cp -R results/. web/dist/results/
else
  id=$(node -p "require('./examples/current.json').buildId")
  mkdir -p "web/dist/results/$id"
  cp examples/current.json web/dist/results/current.json
  cp -R examples/. "web/dist/results/$id/"
  rm -rf "web/dist/results/$id/golden" "web/dist/results/$id/power"
fi
cp web/dist-offline/index.html web/dist/casefile-earth-offline.html
