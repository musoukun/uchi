import React from 'react';

type Props = {
  user: { name?: string | null; avatarUrl?: string | null } | null | undefined;
  size?: 'lg';
};

export function Avatar({ user, size }: Props) {
  if (!user) return <span className="avatar" />;
  const initial = (user.name || '?').charAt(0).toUpperCase();
  return <span className={'avatar' + (size === 'lg' ? ' lg' : '')}>{initial}</span>;
}
