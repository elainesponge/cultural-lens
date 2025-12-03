import React from 'react';

// Helper to parse bold syntax (**text**) within a string
const parseBold = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-inherit">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (currentList.length > 0) {
      elements.push(
        <ul
          key={`${keyPrefix}-list`}
          className="list-disc pl-5 mb-4 space-y-1 marker:opacity-60"
        >
          {currentList.map((item, liIdx) => (
            <li key={liIdx} className="pl-1 leading-relaxed text-inherit">
              {parseBold(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // 1. Handle List Items
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      currentList.push(trimmed.substring(2));
      return; // Skip adding this line directly, wait for flush
    }

    // If we were building a list, flush it now since we hit a non-list line
    flushList(`line-${index}`);

    // 2. Handle Empty Lines (Spacers)
    if (!trimmed) {
      return;
    }

    // 3. Handle Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${index}`} className="text-lg font-bold mt-5 mb-2 text-inherit">
          {parseBold(trimmed.substring(4))}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${index}`} className="text-xl font-bold mt-6 mb-3 text-inherit">
          {parseBold(trimmed.substring(3))}
        </h2>
      );
    } else {
      // 4. Handle Standard Paragraphs
      // Check if it's a standalone bold line which often acts as a subheader
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
         elements.push(
            <p key={`p-${index}`} className="font-bold mb-2 text-inherit">
              {parseBold(trimmed)}
            </p>
         );
      } else {
        elements.push(
          <p key={`p-${index}`} className="mb-3 leading-relaxed text-inherit last:mb-0">
            {parseBold(trimmed)}
          </p>
        );
      }
    }
  });

  // Flush any remaining list items at the end
  flushList('end');

  return <div className="text-sm md:text-base text-inherit">{elements}</div>;
};

export default MarkdownRenderer;