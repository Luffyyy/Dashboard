import React, { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export default function FileUpload({ onDataLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const parseCSV = useCallback((text) => {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map((h) => h.trim());

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      if (values.length === headers.length) {
        const record = {};
        headers.forEach((h, idx) => {
          record[h] = values[idx];
        });
        records.push(record);
      }
    }
    return records;
  }, []);

  const processFile = useCallback(
    (f) => {
      setFile(f);
      setError(null);
      setIsProcessing(true);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const records = parseCSV(text);

        if (records.length === 0) {
          setError("הקובץ ריק או בפורמט לא תקין");
          setIsProcessing(false);
          return;
        }

        const grouped = {
          Temperature: [],
          Humidity: [],
          Pressure: [],
        };

        records.forEach((r) => {
          const type = r["Sensor Type"];
          const value = parseFloat(r["Value"]);
          const timestamp = r["Timestamp"];
          if (grouped[type] && !isNaN(value)) {
            grouped[type].push({ timestamp, value });
          }
        });

        setTimeout(() => {
          setIsProcessing(false);
          onDataLoaded(grouped, records.length);
        }, 600);
      };
      reader.onerror = () => {
        setError("שגיאה בקריאת הקובץ");
        setIsProcessing(false);
      };
      reader.readAsText(f);
    },
    [onDataLoaded, parseCSV]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith(".csv")) {
        processFile(f);
      } else {
        setError("יש להעלות קובץ CSV בלבד");
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e) => {
      const f = e.target.files[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  const clearFile = () => {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          relative rounded-3xl border-2 border-dashed p-12 text-center transition-all duration-300 cursor-pointer
          ${
            isDragging
              ? "border-primary bg-accent scale-[1.02] shadow-lg"
              : "border-border bg-card hover:border-primary/40 hover:bg-accent/50"
          }
        `}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-lg font-medium text-foreground">
                מעבד את הנתונים...
              </p>
            </motion.div>
          ) : file && !error ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-medium text-foreground">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="rounded-full"
              >
                <X className="w-4 h-4 ml-1" />
                הסר קובץ
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center">
                <Upload className="w-9 h-9 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground mb-1">
                  גרור קובץ CSV לכאן
                </p>
                <p className="text-sm text-muted-foreground">
                  או לחץ כדי לבחור קובץ מהמחשב
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <span className="text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                  Timestamp
                </span>
                <span className="text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                  Sensor Type
                </span>
                <span className="text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full">
                  Value
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-destructive text-sm mt-4"
          >
            {error}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}