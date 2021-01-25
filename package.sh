cd "$(dirname "$0")"

zip \
  --exclude "*.git*" \
  --exclude "*.zip" \
  --exclude "*.xpi" \
  --exclude README.md \
  --exclude package.sh \
  --recurse-paths \
  --filesync \
  edge_touch_pager.zip \
  *
