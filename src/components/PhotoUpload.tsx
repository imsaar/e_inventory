import { useState, useRef } from 'react';
import { Camera, Upload, X, Image as ImageIcon, Loader } from 'lucide-react';

interface PhotoUploadProps {
  label: string;
  photoUrl?: string;
  onPhotoChange: (photoUrl: string | null) => void;
  disabled?: boolean;
  acceptedFormats?: string[];
  maxSizeMB?: number;
}

export function PhotoUpload({ 
  label, 
  photoUrl, 
  onPhotoChange, 
  disabled = false,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxSizeMB = 5
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return `Invalid file type. Accepted formats: ${acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')}`;
    }
    
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }
    
    return null;
  };

  const handleFileUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch('/api/uploads/photo', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      onPhotoChange(data.photoUrl);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const handleRemovePhoto = async () => {
    if (!photoUrl) return;

    try {
      const response = await fetch('/api/uploads/photo', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photoUrl }),
      });

      if (response.ok) {
        onPhotoChange(null);
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete photo');
      }
    } catch (err) {
      console.error('Delete error:', err);
      setError('Failed to delete photo');
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="photo-upload">
      <label className="form-label">{label}</label>
      
      <div className="photo-upload-container">
        {photoUrl ? (
          <div className="photo-preview">
            <img
              src={photoUrl}
              alt="Preview"
              className="preview-image"
              onError={() => setError('Failed to load image')}
            />
            {!disabled && (
              <button
                type="button"
                className="remove-photo-btn"
                onClick={handleRemovePhoto}
                title="Remove photo"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ) : (
          <div
            className={`photo-upload-area ${dragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={disabled ? undefined : openFileDialog}
          >
            {uploading ? (
              <div className="upload-loading">
                <Loader size={24} className="spinning" />
                <span>Uploading...</span>
              </div>
            ) : (
              <div className="upload-placeholder">
                <div className="upload-icon">
                  <Camera size={32} />
                </div>
                <div className="upload-text">
                  <p className="upload-primary">Click to upload or drag and drop</p>
                  <p className="upload-secondary">
                    {acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')} up to {maxSizeMB}MB
                  </p>
                </div>
                <button
                  type="button"
                  className="upload-btn"
                  disabled={disabled}
                >
                  <Upload size={16} />
                  Choose File
                </button>
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(',')}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={disabled}
        />

        {error && (
          <div className="upload-error">
            <span className="error-text">{error}</span>
          </div>
        )}

        <div className="upload-info">
          <small className="upload-help">
            <ImageIcon size={12} />
            Supports {acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')} files up to {maxSizeMB}MB
          </small>
        </div>
      </div>
    </div>
  );
}