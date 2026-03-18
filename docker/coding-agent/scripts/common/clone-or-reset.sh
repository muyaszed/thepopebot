#!/bin/bash
# Clone repo if workspace is empty, otherwise fetch and reset to clean state

cd /home/coding-agent/workspace

if [ ! -d ".git" ]; then
    git clone --branch "$BRANCH" "https://github.com/$REPO" .
else
    git fetch origin
    git checkout "$BRANCH"
    git reset --hard "origin/$BRANCH"
    git clean -fd
fi
