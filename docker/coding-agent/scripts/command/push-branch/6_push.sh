#!/bin/bash
cd /home/coding-agent/workspace
git push origin "${FEATURE_BRANCH:-${BRANCH:-main}}"
