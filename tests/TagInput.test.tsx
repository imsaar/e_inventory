import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagInput } from '../src/components/TagInput';

describe('TagInput Component', () => {
  const defaultProps = {
    label: 'Test Tags',
    tags: [],
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly with empty tags', () => {
    render(<TagInput {...defaultProps} />);
    
    expect(screen.getByLabelText('Test Tags')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type and press Enter to add tags')).toBeInTheDocument();
    expect(screen.queryByText('0 / 10 tags')).not.toBeInTheDocument();
  });

  it('should display existing tags', () => {
    const tags = ['react', 'typescript', 'testing'];
    render(<TagInput {...defaultProps} tags={tags} />);

    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('testing')).toBeInTheDocument();
    expect(screen.getByText('3 / 10 tags')).toBeInTheDocument();
  });

  it('should add a tag when Enter is pressed', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    
    render(<TagInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    
    await user.type(input, 'new-tag');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(['new-tag']);
    expect(input).toHaveValue('');
  });

  it('should add a tag when the plus button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    
    render(<TagInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    await user.type(input, 'click-tag');
    
    const addButton = screen.getByTitle('Add tag');
    await user.click(addButton);

    expect(onChange).toHaveBeenCalledWith(['click-tag']);
    expect(input).toHaveValue('');
  });

  it('should remove a tag when X button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const tags = ['tag1', 'tag2', 'tag3'];
    
    render(<TagInput {...defaultProps} tags={tags} onChange={onChange} />);
    
    const removeButtons = screen.getAllByTitle('Remove tag');
    await user.click(removeButtons[1]); // Remove 'tag2'

    expect(onChange).toHaveBeenCalledWith(['tag1', 'tag3']);
  });

  it('should prevent duplicate tags', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const tags = ['existing-tag'];
    
    render(<TagInput {...defaultProps} tags={tags} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    await user.type(input, 'existing-tag');
    await user.keyboard('{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('existing-tag'); // Input not cleared
  });

  it('should enforce maximum tag limit', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const maxTags = 3;
    const tags = ['tag1', 'tag2', 'tag3'];
    
    render(<TagInput {...defaultProps} tags={tags} maxTags={maxTags} />);
    
    const input = screen.getByDisplayValue('');
    expect(input).toBeDisabled();
    expect(screen.getByPlaceholderText('Maximum 3 tags allowed')).toBeInTheDocument();
    
    await user.type(input, 'new-tag');
    await user.keyboard('{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should show add button only when input has content and within limits', async () => {
    const user = userEvent.setup();
    
    render(<TagInput {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    
    // Initially no add button
    expect(screen.queryByTitle('Add tag')).not.toBeInTheDocument();
    
    // Add button appears when typing
    await user.type(input, 'test');
    expect(screen.getByTitle('Add tag')).toBeInTheDocument();
    
    // Add button disappears when input is cleared
    await user.clear(input);
    expect(screen.queryByTitle('Add tag')).not.toBeInTheDocument();
  });

  it('should not show add button when at max tags limit', async () => {
    const user = userEvent.setup();
    const tags = ['tag1', 'tag2'];
    
    render(<TagInput {...defaultProps} tags={tags} maxTags={2} />);
    
    const input = screen.getByDisplayValue('');
    await user.type(input, 'test');
    
    expect(screen.queryByTitle('Add tag')).not.toBeInTheDocument();
  });

  it('should handle disabled state', () => {
    const tags = ['tag1', 'tag2'];
    render(<TagInput {...defaultProps} tags={tags} disabled={true} />);
    
    const input = screen.getByDisplayValue('');
    expect(input).toBeDisabled();
    
    // Remove buttons should not be present when disabled
    expect(screen.queryAllByTitle('Remove tag')).toHaveLength(0);
  });

  it('should use custom placeholder', () => {
    const customPlaceholder = 'Add your custom tags here';
    render(<TagInput {...defaultProps} placeholder={customPlaceholder} />);
    
    expect(screen.getByPlaceholderText(customPlaceholder)).toBeInTheDocument();
  });

  it('should trim whitespace from tags', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    
    render(<TagInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    await user.type(input, '  whitespace-tag  ');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(['whitespace-tag']);
  });

  it('should not add empty or whitespace-only tags', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    
    render(<TagInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    
    // Test empty string
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    
    // Test whitespace only
    await user.type(input, '   ');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should handle keyboard events properly', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    
    render(<TagInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    
    await user.type(input, 'test-tag');
    
    // Test that other keys don't trigger add
    await user.keyboard('{Tab}');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('test-tag');
    
    // Test Enter does trigger add
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(['test-tag']);
  });

  it('should display correct tag count information', () => {
    const tags = ['tag1', 'tag2', 'tag3'];
    const maxTags = 5;
    
    render(<TagInput {...defaultProps} tags={tags} maxTags={maxTags} />);
    
    expect(screen.getByText('3 / 5 tags')).toBeInTheDocument();
  });

  it('should handle tag removal accessibility', () => {
    const tags = ['accessible-tag'];
    render(<TagInput {...defaultProps} tags={tags} />);
    
    const removeButton = screen.getByTitle('Remove tag');
    expect(removeButton).toBeInTheDocument();
    expect(removeButton).toHaveAttribute('type', 'button');
  });

  it('should prevent form submission when adding tags', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onSubmit = jest.fn((e) => e.preventDefault());
    
    render(
      <form onSubmit={onSubmit}>
        <TagInput {...defaultProps} onChange={onChange} />
        <button type="submit">Submit</button>
      </form>
    );
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    await user.type(input, 'test-tag');
    await user.keyboard('{Enter}');

    // Form should not be submitted
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(['test-tag']);
  });

  it('should handle rapid tag additions', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    
    render(<TagInput {...defaultProps} onChange={onChange} />);
    
    const input = screen.getByPlaceholderText('Type and press Enter to add tags');
    
    // Add multiple tags rapidly
    await user.type(input, 'tag1');
    await user.keyboard('{Enter}');
    await user.type(input, 'tag2');
    await user.keyboard('{Enter}');
    await user.type(input, 'tag3');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenNthCalledWith(1, ['tag1']);
    expect(onChange).toHaveBeenNthCalledWith(2, ['tag2']);
    expect(onChange).toHaveBeenNthCalledWith(3, ['tag3']);
  });
});