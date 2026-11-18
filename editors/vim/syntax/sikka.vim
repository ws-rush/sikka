if exists('b:current_syntax') | finish | endif

runtime! syntax/html.vim
unlet! b:current_syntax

syntax include @sikkaTS syntax/typescript.vim
unlet! b:current_syntax
syntax include @sikkaJS syntax/javascript.vim
unlet! b:current_syntax
syntax include @sikkaCSS syntax/css.vim
unlet! b:current_syntax

syntax region sikkaFrontmatter matchgroup=Delimiter start=/\%^---$/ end=/^---$/ contains=@sikkaTS keepend

syntax region sikkaExpression matchgroup=Delimiter start=/{/ end=/}/ contains=@sikkaTS,sikkaExpressionBrace containedin=TOP,htmlTag
syntax region sikkaExpressionBrace start=/{/ end=/}/ contained contains=@sikkaTS,sikkaExpressionBrace

syntax match sikkaDirective /\<\(set:html\|set:text\|class:list\|is:raw\)\>/ containedin=htmlTag
syntax match sikkaSpecialTag /<\/\?\(Fragment\|slot\)\>/ containedin=htmlTag
syntax keyword sikkaGlobal Sikka containedin=sikkaFrontmatter,sikkaExpression,sikkaExpressionBrace

hi def link sikkaDirective Keyword
hi def link sikkaSpecialTag Type
hi def link sikkaGlobal Special

let b:current_syntax = 'sikka'
