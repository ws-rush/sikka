((frontmatter
  (raw_text) @injection.content)
  (#set! injection.language "typescript"))

((interpolation
  (expression) @injection.content)
  (#set! injection.language "typescript"))

((expression_attribute
  (expression) @injection.content)
  (#set! injection.language "typescript"))

((spread_attribute
  (expression) @injection.content)
  (#set! injection.language "typescript"))

((script_element
  (raw_text) @injection.content)
  (#set! injection.language "javascript"))

((style_element
  (raw_text) @injection.content)
  (#set! injection.language "css"))
