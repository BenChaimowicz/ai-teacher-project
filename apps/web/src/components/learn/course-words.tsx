import { useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { filterCourseWords, type CourseWords } from "@/components/learn/words.ts";
import { ChatThread, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { Input } from "@/components/ui/input.tsx";
import { EmptyState } from "@/components/ui/states.tsx";
import "@/components/learn/learn.css";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "3 more words open as you go." Null when nothing is held back.
 * @param hidden - Words only locked Lessons have defined so far
 */
function moreLine(hidden: number): string | null {
  if (hidden <= 0) return null;
  return `${hidden} more ${hidden === 1 ? "word opens" : "words open"} as you go.`;
}

type CourseWordsViewProps = {
  courseId: string;
  words: CourseWords;
};

/**
 * The Course's Words page: every word its open Readings stopped to explain, grouped under the Lesson that explained it
 * first (the heading links back to that Lesson), each on a small paper sheet shaped like Jongi's bubble, with the term
 * as a paper key and its meaning in plain text. A "find a word" field filters by term or meaning as you type. Words from
 * Lessons still locked are counted in one quiet line, not listed.
 */
export function CourseWordsView({ courseId, words }: CourseWordsViewProps) {
  const [query, setQuery] = useState("");
  const groups = filterCourseWords(words, query);
  const more = moreLine(words.hidden);

  return (
    <div className="l-words">
      <header className="l-lhead">
        <p className="l-kicker">words</p>
        <h1>Words</h1>
      </header>
      {words.count === 0 ? (
        <EmptyState title={words.hidden > 0 ? "No words open yet" : "No words yet"}>
          {words.hidden > 0 ? `${more} Each lesson's words show here once you can open it.` : "This course's lessons haven't stopped to explain a word."}
        </EmptyState>
      ) : (
        <>
          <ChatThread label="Words">
            <CompanionLine>
              {words.count} {words.count === 1 ? "word" : "words"} this course stopped to explain. Each one sits under the lesson that explained it.
            </CompanionLine>
          </ChatThread>
          <div className="l-words-find">
            <Input
              type="search"
              placeholder="find a word"
              aria-label="Find a word"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              trailing={<Search aria-hidden="true" />}
            />
          </div>
          {groups.length === 0 ? (
            <p className="l-words-none" role="status">
              No words match “{query.trim()}”.
            </p>
          ) : null}
          {groups.map((group) => (
            <section key={group.lesson.id} className="l-wgroup" aria-labelledby={`words-${group.lesson.id}`}>
              <h2 id={`words-${group.lesson.id}`}>
                <span className="idx" aria-hidden="true">
                  lesson {pad(group.lesson.number)}
                </span>
                <Link to={`/study/${courseId}/lessons/${group.lesson.id}`}>
                  <span className="sr-only">Lesson {group.lesson.number}: </span>
                  {group.lesson.title}
                </Link>
              </h2>
              <dl className="l-wlist">
                {group.words.map((word, index) => (
                  <div key={word.term} className="l-word" style={{ "--i": index } as CSSProperties}>
                    <dt>
                      <span className="l-wkey">{word.term}</span>
                    </dt>
                    <dd>{word.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {more ? <p className="l-words-more">{more}</p> : null}
        </>
      )}
    </div>
  );
}
