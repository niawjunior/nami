'use client';

import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Simple in-memory cache for thumbnails
const thumbnailCache = new Map<string, string>();

interface ImageThumbnailProps {
  path: string;
  name: string;
  className?: string;
  size?: number;
}

export function ImageThumbnail({ path, name, className, size = 32 }: ImageThumbnailProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  // Load image when visible
  useEffect(() => {
    if (!isVisible) return;

    // Check cache first
    const cached = thumbnailCache.get(path);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    // Load via electron
    const loadImage = async () => {
      try {
        const result = await window.electron?.readImageAsBase64?.(path);
        if (result) {
          thumbnailCache.set(path, result);
          setDataUrl(result);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Failed to load thumbnail:', err);
        setError(true);
      }
    };

    loadImage();
  }, [isVisible, path]);

  // Fallback to icon if error or not loaded
  if (error || !dataUrl) {
    return (
      <div ref={ref} className={cn("flex items-center justify-center", className)} style={{ width: size, height: size }}>
        <ImageIcon className="w-4 h-4 text-purple-500" />
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("overflow-hidden rounded", className)} style={{ width: size, height: size }}>
      <img 
        src={dataUrl} 
        alt={name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </div>
  );
}
