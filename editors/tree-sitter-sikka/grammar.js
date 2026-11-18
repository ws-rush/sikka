/* global module, grammar */

module.exports = grammar({
  name: 'sikka',

  extras: ($) => [/\s+/, $.comment],

  rules: {
    source_file: ($) => seq(optional($.frontmatter), repeat($._node)),

    frontmatter: ($) =>
      seq(
        '---',
        optional(alias(token(repeat1(choice(/[^-]+/, /-[^-]/, /--[^-]/))), $.raw_text)),
        '---'
      ),

    _node: ($) =>
      choice(
        $.doctype,
        $.comment,
        $.fragment,
        $.script_element,
        $.style_element,
        $.element,
        $.self_closing_element,
        $.interpolation,
        $.text
      ),

    doctype: () => seq('<!', /[Dd][Oo][Cc][Tt][Yy][Pp][Ee]/, /[^>]+/, '>'),

    comment: () => token(seq('<!--', repeat(choice(/[^-]+/, /-[^-]/, /--[^>]/)), '-->')),

    fragment: ($) => seq('<>', repeat($._node), '</>'),

    script_element: ($) =>
      seq(
        '<script',
        repeat($._attribute),
        '>',
        optional(alias(token(repeat1(choice(/[^<]+/, /<[^/]/, /<\/[^s]/))), $.raw_text)),
        '</script>'
      ),

    style_element: ($) =>
      seq(
        '<style',
        repeat($._attribute),
        '>',
        optional(alias(token(repeat1(choice(/[^<]+/, /<[^/]/, /<\/[^s]/))), $.raw_text)),
        '</style>'
      ),

    element: ($) => seq($.start_tag, repeat($._node), $.end_tag),

    self_closing_element: ($) => seq('<', field('name', $.tag_name), repeat($._attribute), '/>'),

    start_tag: ($) => seq('<', field('name', $.tag_name), repeat($._attribute), '>'),

    end_tag: ($) => seq('</', field('name', $.tag_name), '>'),

    tag_name: () => /[A-Za-z][A-Za-z0-9._-]*/,

    _attribute: ($) => choice($.spread_attribute, $.expression_attribute, $.attribute),

    spread_attribute: ($) => seq('{...', $.expression, '}'),

    expression_attribute: ($) =>
      seq(field('name', choice($.directive, $.attribute_name)), '=', '{', $.expression, '}'),

    attribute: ($) =>
      seq(
        field('name', choice($.directive, $.attribute_name)),
        optional(seq('=', choice($.quoted_attribute_value, $.attribute_value)))
      ),

    directive: () => choice('set:html', 'set:text', 'class:list', 'is:raw'),

    attribute_name: () => /[^<>{}"'=\s/]+/,

    attribute_value: () => /[^<>{}"'=\s]+/,

    quoted_attribute_value: () =>
      choice(seq('"', optional(/[^"]+/), '"'), seq("'", optional(/[^']+/), "'")),

    interpolation: ($) => seq('{', $.expression, '}'),

    expression: ($) => repeat1(choice(/[^{}]+/, seq('{', optional($.expression), '}'))),

    text: () => token(prec(-1, repeat1(choice(/[^{}<>-]+/, /-[^-]/, /--[^-]/)))),
  },
});
