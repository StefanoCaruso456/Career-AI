"use client";

import { useState } from "react";
import {
  AudioLines,
  BarChart3,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Info,
  Menu,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";
import styles from "./chat-home-shell.module.css";

const modes = ["Thinking", "Trust Review", "Profile Draft"];

const projects = [
  "Verified Candidate Pilot",
  "Recruiter Trust Rollout",
  "Soul Record Ops",
];

const chats = [
  "Acme employment proof",
  "Columbia degree review",
  "AWS cert renewal",
];

const footerLinks = [
  { label: "Analytics", icon: BarChart3 },
  { label: "Verifier Ops", icon: UserRoundSearch },
  { label: "Settings", icon: Settings },
  { label: "About", icon: Info },
];

type SectionProps = {
  label: string;
  icon: typeof FolderKanban;
  items: string[];
  expanded: boolean;
  onToggle: () => void;
  collapsed: boolean;
};

function SidebarSection({
  label,
  icon: Icon,
  items,
  expanded,
  onToggle,
  collapsed,
}: SectionProps) {
  return (
    <section className={styles.section}>
      <button
        aria-expanded={expanded}
        className={styles.sectionButton}
        onClick={onToggle}
        type="button"
      >
        <span className={styles.sectionLabel}>
          <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
          {!collapsed && <span>{label}</span>}
        </span>
        {!collapsed && (
          <ChevronRight
            aria-hidden="true"
            className={expanded ? styles.chevronExpanded : ""}
            size={16}
            strokeWidth={1.9}
          />
        )}
      </button>

      {!collapsed && expanded && (
        <div className={styles.sectionList}>
          {items.map((item) => (
            <button className={styles.sectionItem} key={item} type="button">
              {item}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ChatHomeShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [chatsExpanded, setChatsExpanded] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState(modes[0]);
  const [prompt, setPrompt] = useState("");

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={styles.page}>
      <button
        aria-label="Open navigation"
        className={styles.mobileMenuButton}
        onClick={() => setSidebarOpen(true)}
        type="button"
      >
        <Menu size={18} strokeWidth={1.9} />
        <span>Menu</span>
      </button>

      {sidebarOpen && (
        <button
          aria-label="Close navigation overlay"
          className={styles.backdrop}
          onClick={closeSidebar}
          type="button"
        />
      )}

      <aside
        className={[
          styles.sidebar,
          sidebarOpen ? styles.sidebarVisible : "",
          sidebarCollapsed ? styles.sidebarCollapsed : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.sidebarTop}>
          <div className={styles.brandRow}>
            <button className={styles.brandBadge} type="button">
              <span className={styles.brandMark}>TA</span>
              {!sidebarCollapsed && (
                <span className={styles.brandText}>
                  <strong>Talent Agent ID</strong>
                  <small>Trust workspace</small>
                </span>
              )}
            </button>

            <button
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={styles.iconButton}
              onClick={() => setSidebarCollapsed((current) => !current)}
              type="button"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={16} strokeWidth={1.9} />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.9} />
              )}
            </button>
          </div>

          <label className={styles.searchShell}>
            <Search aria-hidden="true" size={16} strokeWidth={1.9} />
            {!sidebarCollapsed && (
              <input
                aria-label="Search chats"
                className={styles.searchInput}
                placeholder="Search chats"
                type="search"
              />
            )}
          </label>

          <div className={styles.sidebarBody}>
            <SidebarSection
              collapsed={sidebarCollapsed}
              expanded={projectsExpanded}
              icon={FolderKanban}
              items={projects}
              label="Projects"
              onToggle={() => setProjectsExpanded((current) => !current)}
            />

            <SidebarSection
              collapsed={sidebarCollapsed}
              expanded={chatsExpanded}
              icon={MessageSquareText}
              items={chats}
              label="Your chats"
              onToggle={() => setChatsExpanded((current) => !current)}
            />

            <button className={styles.newChatButton} type="button">
              <Plus aria-hidden="true" size={16} strokeWidth={1.9} />
              {!sidebarCollapsed && <span>New Chat</span>}
            </button>
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          {footerLinks.map(({ label, icon: Icon }) => (
            <button className={styles.footerLink} key={label} type="button">
              <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
              {!sidebarCollapsed && <span>{label}</span>}
            </button>
          ))}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.hero}>
          <span className={styles.heroTag}>Talent Agent ID</span>
          <h1 className={styles.heroTitle}>What can I help with?</h1>

          <div className={styles.composer}>
            <div className={styles.composerTop}>
              <label className={styles.promptMeta} htmlFor="agent-prompt">
                Ask anything
              </label>

              <textarea
                className={styles.promptInput}
                id="agent-prompt"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask about identity, proof, or verification workflows"
                rows={2}
                value={prompt}
              />
            </div>

            <div className={styles.toolbar}>
              <div className={styles.toolbarStart}>
                <button aria-label="Add attachment" className={styles.roundButton} type="button">
                  <Plus size={18} strokeWidth={2} />
                </button>

                <div className={styles.modePicker}>
                  <button
                    aria-expanded={modeMenuOpen}
                    className={styles.modeButton}
                    onClick={() => setModeMenuOpen((current) => !current)}
                    type="button"
                  >
                    <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.9} />
                    <span>{selectedMode}</span>
                    <ChevronDown aria-hidden="true" size={15} strokeWidth={1.9} />
                  </button>

                  {modeMenuOpen && (
                    <div className={styles.modeMenu}>
                      {modes.map((mode) => (
                        <button
                          className={styles.modeOption}
                          key={mode}
                          onClick={() => {
                            setSelectedMode(mode);
                            setModeMenuOpen(false);
                          }}
                          type="button"
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.toolbarEnd}>
                <button aria-label="Voice input" className={styles.inlineIconButton} type="button">
                  <Mic size={16} strokeWidth={1.9} />
                </button>

                <button aria-label="Open voice agent" className={styles.voiceButton} type="button">
                  <AudioLines size={18} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
