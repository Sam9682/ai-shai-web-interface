import { useRef, useEffect } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const RichTextEditor = ({ value, onChange, placeholder, disabled }: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      isUpdatingRef.current = true;
      onChange(editorRef.current.innerHTML);
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 0);
    }
  };

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertEmoji = (emoji: string) => {
    document.execCommand('insertText', false, emoji);
    editorRef.current?.focus();
    handleInput();
  };

  const insertImage = () => {
    const url = prompt('Entrez l\'URL de l\'image:');
    if (url) {
      execCommand('insertImage', url);
    }
  };

  const emojis = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '✨', '💡', '🚀', '👏', '🤔', '😍', '😭', '😡', '😱'];

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-300 p-2 flex flex-wrap gap-1">
        {/* Text formatting */}
        <div className="flex gap-1 border-r border-gray-300 pr-2">
          <button
            type="button"
            onClick={() => execCommand('bold')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Gras (Ctrl+B)"
            disabled={disabled}
          >
            <span className="font-bold">B</span>
          </button>
          <button
            type="button"
            onClick={() => execCommand('italic')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Italique (Ctrl+I)"
            disabled={disabled}
          >
            <span className="italic">I</span>
          </button>
          <button
            type="button"
            onClick={() => execCommand('underline')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Souligné (Ctrl+U)"
            disabled={disabled}
          >
            <span className="underline">U</span>
          </button>
          <button
            type="button"
            onClick={() => execCommand('strikeThrough')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Barré"
            disabled={disabled}
          >
            <span className="line-through">S</span>
          </button>
        </div>

        {/* Headings */}
        <div className="flex gap-1 border-r border-gray-300 pr-2">
          <button
            type="button"
            onClick={() => execCommand('formatBlock', '<h1>')}
            className="p-2 hover:bg-gray-200 rounded transition-colors text-sm font-bold"
            title="Titre 1"
            disabled={disabled}
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => execCommand('formatBlock', '<h2>')}
            className="p-2 hover:bg-gray-200 rounded transition-colors text-sm font-bold"
            title="Titre 2"
            disabled={disabled}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => execCommand('formatBlock', '<h3>')}
            className="p-2 hover:bg-gray-200 rounded transition-colors text-sm font-bold"
            title="Titre 3"
            disabled={disabled}
          >
            H3
          </button>
        </div>

        {/* Lists */}
        <div className="flex gap-1 border-r border-gray-300 pr-2">
          <button
            type="button"
            onClick={() => execCommand('insertUnorderedList')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Liste à puces"
            disabled={disabled}
          >
            • Liste
          </button>
          <button
            type="button"
            onClick={() => execCommand('insertOrderedList')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Liste numérotée"
            disabled={disabled}
          >
            1. Liste
          </button>
        </div>

        {/* Alignment */}
        <div className="flex gap-1 border-r border-gray-300 pr-2">
          <button
            type="button"
            onClick={() => execCommand('justifyLeft')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Aligner à gauche"
            disabled={disabled}
          >
            ⬅
          </button>
          <button
            type="button"
            onClick={() => execCommand('justifyCenter')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Centrer"
            disabled={disabled}
          >
            ↔
          </button>
          <button
            type="button"
            onClick={() => execCommand('justifyRight')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Aligner à droite"
            disabled={disabled}
          >
            ➡
          </button>
        </div>

        {/* Other */}
        <div className="flex gap-1 border-r border-gray-300 pr-2">
          <button
            type="button"
            onClick={() => execCommand('insertHorizontalRule')}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Ligne de séparation"
            disabled={disabled}
          >
            ―
          </button>
          <button
            type="button"
            onClick={insertImage}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Insérer une image"
            disabled={disabled}
          >
            🖼️
          </button>
        </div>

        {/* Emojis */}
        <div className="flex gap-1">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="p-1 hover:bg-gray-200 rounded transition-colors text-lg"
              title={`Insérer ${emoji}`}
              disabled={disabled}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        className="p-4 min-h-[200px] max-h-[500px] overflow-y-auto focus:outline-none prose prose-sm max-w-none"
        style={{
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
        data-placeholder={placeholder}
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        
        [contenteditable] h1 {
          font-size: 2em;
          font-weight: bold;
          margin: 0.67em 0;
        }
        
        [contenteditable] h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin: 0.75em 0;
        }
        
        [contenteditable] h3 {
          font-size: 1.17em;
          font-weight: bold;
          margin: 0.83em 0;
        }
        
        [contenteditable] ul, [contenteditable] ol {
          margin: 1em 0;
          padding-left: 2em;
        }
        
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1em 0;
        }
        
        [contenteditable] hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 1.5em 0;
        }
      `}</style>
    </div>
  );
};
