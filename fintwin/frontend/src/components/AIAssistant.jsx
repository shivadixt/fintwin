import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AIAssistant = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { sender: 'ai', text: 'Hi there! I am your AI Financial Planner. How can I help you today?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const { user } = useAuth();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || !user?.id) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
        setInput('');
        setIsLoading(true);

        try {
            const token = sessionStorage.getItem('ft_token');
            const res = await axios.post('/api/simulate/chat', 
                {
                    account_id: user.id,
                    message: userMsg
                },
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
            
            setMessages(prev => [...prev, { sender: 'ai', text: res.data.response }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { sender: 'ai', text: 'Error: Could not reach the financial engine. Please try again later.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="ai-assistant-container">
            {isOpen ? (
                <div className="ai-chat-window slide-up">
                    <div className="ai-chat-header">
                        <div className="ai-chat-title">
                            <span className="bot-icon">🤖</span>
                            <span>FinTwin AI Planner</span>
                        </div>
                        <button className="ai-close-btn" onClick={() => setIsOpen(false)}>&times;</button>
                    </div>
                    
                    <div className="ai-chat-body">
                        {messages.map((msg, index) => (
                            <div key={index} className={`chat-bubble ${msg.sender}`}>
                                {msg.text}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="chat-bubble ai typing-indicator">
                                <span>.</span><span>.</span><span>.</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="ai-chat-input-area" onSubmit={handleSend}>
                        <input 
                            type="text" 
                            className="ai-input-field" 
                            placeholder="Ask about trips, budgets, cars..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading}
                        />
                        <button type="submit" className="ai-send-btn" disabled={isLoading || !input.trim()}>
                            Send
                        </button>
                    </form>
                </div>
            ) : (
                <button className="ai-toggle-btn pulse" onClick={() => setIsOpen(true)}>
                    <span>✨ Ask AI</span>
                </button>
            )}
        </div>
    );
};

export default AIAssistant;
