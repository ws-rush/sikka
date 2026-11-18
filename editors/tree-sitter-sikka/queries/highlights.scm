(comment) @comment
(doctype) @constant

(tag_name) @tag
((tag_name) @type
  (#match? @type "^[A-Z]"))

(directive) @keyword
(attribute_name) @attribute
(quoted_attribute_value) @string
(attribute_value) @string

[
  "<"
  ">"
  "</"
  "/>"
  "<>"
  "</>"
  "{"
  "}"
  "{..."
  "---"
] @punctuation.bracket
