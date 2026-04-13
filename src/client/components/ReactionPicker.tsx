import React, { useEffect, useRef } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';

type Props = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export function ReactionPicker({ onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  return (
    <div className="reaction-picker-popup" ref={ref}>
      <EmojiPicker
        onEmojiClick={(data: EmojiClickData) => {
          onSelect(data.emoji);
          onClose();
        }}
        width={300}
        height={350}
        searchPlaceholder="絵文字を検索..."
        lazyLoadEmojis
      />
    </div>
  );
}
