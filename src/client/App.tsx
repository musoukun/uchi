import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';
import { HomePage } from './pages/HomePage';
import { TrendingPage } from './pages/TrendingPage';
import { FollowingPage } from './pages/FollowingPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { ArticlePage } from './pages/ArticlePage';
import { EditorPage } from './pages/EditorPage';
import { ProfilePage } from './pages/ProfilePage';
import { TopicPage } from './pages/TopicPage';
import { DraftsPage } from './pages/DraftsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* 公開 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/articles/:id" element={<ArticlePage />} />
        <Route path="/users/:id" element={<ProfilePage />} />
        <Route path="/topics/:slug" element={<TopicPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 要ログイン */}
        <Route
          path="/following"
          element={
            <RequireAuth>
              <FollowingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/bookmarks"
          element={
            <RequireAuth>
              <BookmarksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/editor"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/me/drafts"
          element={
            <RequireAuth>
              <DraftsPage />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
