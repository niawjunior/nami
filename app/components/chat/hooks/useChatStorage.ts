'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const DB_NAME = 'nami-chat';
const STORE_NAME = 'conversations';
const DB_VERSION = 1;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt?: Date;
  toolInvocations?: any[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: Date;
  updatedAt: Date;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

export function useChatStorage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load all conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
          const convs = request.result as Conversation[];
          // Sort by updatedAt descending
          convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setConversations(convs);
          
          // Set current to most recent, or null if none
          if (convs.length > 0) {
            setCurrentConversationId(convs[0].id);
          }
          setIsLoading(false);
        };
        
        request.onerror = () => {
          console.error('Failed to load conversations');
          setIsLoading(false);
        };
      } catch (err) {
        console.error('IndexedDB error:', err);
        setIsLoading(false);
      }
    };
    
    loadConversations();
  }, []);

  // Get current conversation
  const currentConversation = conversations.find(c => c.id === currentConversationId) || null;

  // Create new conversation
  const createConversation = useCallback(async (title?: string): Promise<string> => {
    const id = `conv-${Date.now()}`;
    const now = new Date();
    const conv: Conversation = {
      id,
      title: title || 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add(conv);
      
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(id);
      return id;
    } catch (err) {
      console.error('Failed to create conversation:', err);
      throw err;
    }
  }, []);

  // Save messages to current conversation (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const saveMessages = useCallback(async (messages: StoredMessage[]) => {
    if (!currentConversationId) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce: wait 2 seconds before actually saving
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        const getRequest = store.get(currentConversationId);
        getRequest.onsuccess = () => {
          const conv = getRequest.result as Conversation;
          if (conv) {
            conv.messages = messages;
            conv.updatedAt = new Date();
            // Update title from first user message if default
            if (conv.title === 'New Chat' && messages.length > 0) {
              const firstUserMsg = messages.find(m => m.role === 'user');
              if (firstUserMsg) {
                conv.title = firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
              }
            }
            store.put(conv);
            
            // Update local state
            setConversations(prev => 
              prev.map(c => c.id === currentConversationId ? conv : c)
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            );
          }
        };
      } catch (err) {
        console.error('Failed to save messages:', err);
      }
    }, 2000);
  }, [currentConversationId]);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      
      setConversations(prev => prev.filter(c => c.id !== id));
      
      // If deleted current, switch to next
      if (currentConversationId === id) {
        const remaining = conversations.filter(c => c.id !== id);
        setCurrentConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, [currentConversationId, conversations]);

  // Switch conversation
  const switchConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  return {
    conversations,
    currentConversation,
    currentConversationId,
    isLoading,
    createConversation,
    saveMessages,
    deleteConversation,
    switchConversation,
  };
}
