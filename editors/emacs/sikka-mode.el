;;; sikka-mode.el --- Major mode for Sikka templates  -*- lexical-binding: t; -*-

;;; Code:

(defvar sikka-font-lock-keywords
  '(("^---$" . font-lock-comment-delimiter-face)
    ("{\\([^}]+\\)}" 0 font-lock-variable-name-face t)
    ("\\_<\\(set:html\\|set:text\\|class:list\\|is:raw\\)\\_>" . font-lock-keyword-face)
    ("</?\\([A-Z][A-Za-z0-9.]*\\)\\_>" 1 font-lock-type-face)
    ("\\_<Sikka\\_>" . font-lock-builtin-face))
  "Font-lock keywords for `sikka-mode'.")

;;;###autoload
(define-derived-mode sikka-mode html-mode "Sikka"
  "Major mode for editing Sikka template files."
  (font-lock-add-keywords nil sikka-font-lock-keywords))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.sikka\\'" . sikka-mode))

(provide 'sikka-mode)
;;; sikka-mode.el ends here
