"use client";
import { useState, useRef, useEffect } from 'react';

export default function MemeEditor({ sourceImage, onPublish, onCancel }) {
  const canvasRef = useRef(null);
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = sourceImage;
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
      drawCanvas();
    };
  }, [sourceImage]);

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [topText, bottomText, imageLoaded]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions to image dimensions
    canvas.width = imgRef.current.width;
    canvas.height = imgRef.current.height;

    // Draw background image
    ctx.drawImage(imgRef.current, 0, 0);

    // Text styling
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.floor(canvas.height / 30);
    ctx.textAlign = 'center';
    
    // Dynamic font size
    const fontSize = Math.floor(canvas.height / 8);
    ctx.font = `bold ${fontSize}px Impact, sans-serif`;

    // Draw Top Text
    if (topText) {
      ctx.textBaseline = 'top';
      ctx.strokeText(topText.toUpperCase(), canvas.width / 2, 20);
      ctx.fillText(topText.toUpperCase(), canvas.width / 2, 20);
    }

    // Draw Bottom Text
    if (bottomText) {
      ctx.textBaseline = 'bottom';
      ctx.strokeText(bottomText.toUpperCase(), canvas.width / 2, canvas.height - 20);
      ctx.fillText(bottomText.toUpperCase(), canvas.width / 2, canvas.height - 20);
    }
  };

  const handlePublish = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export to base64
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    onPublish(dataUrl);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--glass-bg)', padding: '1.5rem', borderRadius: '12px' }}>
      <h3 style={{ margin: 0 }}>Meme Studio</h3>
      
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="Top Text..." 
          value={topText} 
          onChange={(e) => setTopText(e.target.value)} 
          className="form-input"
          style={{ flex: 1 }}
        />
        <input 
          type="text" 
          placeholder="Bottom Text..." 
          value={bottomText} 
          onChange={(e) => setBottomText(e.target.value)} 
          className="form-input"
          style={{ flex: 1 }}
        />
      </div>

      <div style={{ border: '1px solid var(--glass-border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', background: '#000' }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}></canvas>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={handlePublish} className="btn-primary" disabled={!imageLoaded}>Publish Meme</button>
      </div>
    </div>
  );
}
