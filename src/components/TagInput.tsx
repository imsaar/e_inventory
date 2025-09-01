import { useState, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';

interface TagInputProps {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
}

export function TagInput({ 
  label, 
  tags, 
  onChange, 
  placeholder = "Type and press Enter to add tags",
  disabled = false,
  maxTags = 10 
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim() && !disabled) {
      e.preventDefault();
      addTag(inputValue.trim());
    }
  };

  const addTag = (tag: string) => {
    // Prevent duplicate tags and enforce max limit
    if (tag && !tags.includes(tag) && tags.length < maxTags) {
      onChange([...tags, tag]);
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    if (!disabled) {
      onChange(tags.filter(tag => tag !== tagToRemove));
    }
  };

  const handleAddClick = () => {
    if (inputValue.trim() && !disabled) {
      addTag(inputValue.trim());
    }
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      
      <div className="tag-input-container">
        <div className="tag-input-wrapper">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={tags.length >= maxTags ? `Maximum ${maxTags} tags allowed` : placeholder}
            disabled={disabled || tags.length >= maxTags}
            className="tag-input"
          />
          {inputValue.trim() && !disabled && tags.length < maxTags && (
            <button
              type="button"
              onClick={handleAddClick}
              className="tag-add-btn"
              title="Add tag"
            >
              <Plus size={16} />
            </button>
          )}
        </div>

        <div className="tags-list">
          {tags.map((tag, index) => (
            <span key={index} className="tag-item">
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="tag-remove-btn"
                  title="Remove tag"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="tags-info">
            {tags.length} / {maxTags} tags
          </div>
        )}
      </div>
    </div>
  );
}