import React from 'react';

/**
 * Converts URLs in text to clickable links while keeping the rest as plain text
 */
export function linkify(text: string): React.ReactNode[] {
  if (!text) return [];

  // URL regex pattern that matches http/https URLs
  const urlRegex = /(https?:\/\/[^\s<>"\[\]{}|\\^`]+)/gi;
  
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer"
          className="description-link"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

/**
 * Component that renders text with clickable links
 */
export function LinkifiedText({ children }: { children: string }) {
  return <>{linkify(children)}</>;
}