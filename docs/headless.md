# 使用 Headless CLI

在脚本和自动化工作流程中使用光标CLI进行代码分析、生成和重构任务。

## 工作原理

使用[打印模式](/docs/cli/using#non-interactive-mode)（）进行非交互式脚本和自动化。`-p, --print`

### 脚本中的文件修改

与 （或 ） 结合以修改脚本中的文件：`--print``--force``--yolo`

```
# Enable file modifications in print mode
agent -p --force "Refactor this code to use modern ES6+ syntax"

# Without --force, changes are only proposed, not applied
agent -p "Add JSDoc comments to this file"  # Won't modify files

# Batch processing with actual file changes
find src/ -name "*.js" | while read file; do
  agent -p --force "Add comprehensive JSDoc comments to $file"
done
```

该标志允许代理直接更改文件，无需
坚振`--force`

## 设置

完整安装细节请参见[安装](/docs/cli/installation)与[认证](/docs/cli/reference/authentication)。

```
# Install Cursor CLI (macOS, Linux, WSL)
curl https://cursor.com/install -fsS | bash

# Install Cursor CLI (Windows PowerShell)
irm 'https://cursor.com/install?win32=true' | iex

# Set API key for scripts
export CURSOR_API_KEY=your_api_key_here
agent -p "Analyze this code"
```

## 示例脚本

根据不同的脚本需求使用不同的输出格式。详情请参见[输出格式](/docs/cli/reference/output-format)。

### 搜索代码库

默认情况下，采用格式表达清晰、仅限最终答案的回答：`--print``text`

```
#!/bin/bash
# Simple codebase question - uses text format by default

agent -p "What does this codebase do?"
```

### 自动代码审查

结构化分析的应用：`--output-format json`

```
#!/bin/bash
# simple-code-review.sh - Basic code review script

echo "Starting code review..."

# Review recent changes
agent -p --force --output-format text \
  "Review the recent code changes and provide feedback on:
  - Code quality and readability
  - Potential bugs or issues
  - Security considerations
  - Best practices compliance

  Provide specific suggestions for improvement and write to review.txt"

if [ $? -eq 0 ]; then
  echo "✅ Code review completed successfully"
else
  echo "❌ Code review failed"
  exit 1
fi
```

### 实时进度跟踪

用于消息级进度跟踪，或添加以增量流转差异：`--output-format stream-json``--stream-partial-output`

```
#!/bin/bash
# stream-progress.sh - Track progress in real-time

echo "🚀 Starting stream processing..."

# Track progress in real-time
accumulated_text=""
tool_count=0
start_time=$(date +%s)

agent -p --force --output-format stream-json --stream-partial-output \
  "Analyze this project structure and create a summary report in analysis.txt" | \
  while IFS= read -r line; do
    
    type=$(echo "$line" | jq -r '.type // empty')
    subtype=$(echo "$line" | jq -r '.subtype // empty')
    
    case "$type" in
      "system")
        if [ "$subtype" = "init" ]; then
          model=$(echo "$line" | jq -r '.model // "unknown"')
          echo "🤖 Using model: $model"
        fi
        ;;
        
      "assistant")
        # Accumulate incremental text deltas for smooth progress
        content=$(echo "$line" | jq -r '.message.content[0].text // empty')
        accumulated_text="$accumulated_text$content"
        
        # Show live progress (updates with each character delta)
        printf "\r📝 Generating: %d chars" ${#accumulated_text}
        ;;

      "tool_call")
        if [ "$subtype" = "started" ]; then
          tool_count=$((tool_count + 1))

          # Extract tool information
          if echo "$line" | jq -e '.tool_call.writeToolCall' > /dev/null 2>&1; then
            path=$(echo "$line" | jq -r '.tool_call.writeToolCall.args.path // "unknown"')
            echo -e "\n🔧 Tool #$tool_count: Creating $path"
          elif echo "$line" | jq -e '.tool_call.readToolCall' > /dev/null 2>&1; then
            path=$(echo "$line" | jq -r '.tool_call.readToolCall.args.path // "unknown"')
            echo -e "\n📖 Tool #$tool_count: Reading $path"
          fi

        elif [ "$subtype" = "completed" ]; then
          # Extract and show tool results
          if echo "$line" | jq -e '.tool_call.writeToolCall.result.success' > /dev/null 2>&1; then
            lines=$(echo "$line" | jq -r '.tool_call.writeToolCall.result.success.linesCreated // 0')
            size=$(echo "$line" | jq -r '.tool_call.writeToolCall.result.success.fileSize // 0')
            echo "   ✅ Created $lines lines ($size bytes)"
          elif echo "$line" | jq -e '.tool_call.readToolCall.result.success' > /dev/null 2>&1; then
            lines=$(echo "$line" | jq -r '.tool_call.readToolCall.result.success.totalLines // 0')
            echo "   ✅ Read $lines lines"
          fi
        fi
        ;;

      "result")
        duration=$(echo "$line" | jq -r '.duration_ms // 0')
        end_time=$(date +%s)
        total_time=$((end_time - start_time))

        echo -e "\n\n🎯 Completed in ${duration}ms (${total_time}s total)"
        echo "📊 Final stats: $tool_count tools, ${#accumulated_text} chars generated"
        ;;
    esac
  done
```

## 图像工作

要向代理发送图片、媒体文件或其他二进制数据，请在提示中包含文件路径。代理可以通过工具调用读取任何文件，包括图片、视频及其他格式。

### 在提示中包含文件路径

只需在提示文本中引用文件路径即可。代理在需要时会自动读取文件：

```
# Analyze an image
agent -p "Analyze this image and describe what you see: ./screenshot.png"

# Process multiple media files
agent -p "Compare these two images and identify differences: ./before.png ./after.png"

# Combine file paths with text instructions
agent -p "Review the code in src/app.ts and the design mockup in designs/homepage.png. Suggest improvements to match the design."
```

### 工作原理

当你在提示词中包含文件路径时：

1. 代理会收到带有文件路径引用的提示
2. 代理使用工具调用自动读取文件
3. 图像处理是透明的
4. 你可以用相对路径或绝对路径引用文件

### 示例：图像分析脚本

```
#!/bin/bash
# analyze-image.sh - Analyze images using the headless CLI

IMAGE_PATH="./screenshots/ui-mockup.png"

agent -p --output-format json \
  "Analyze this image and provide a detailed description: $IMAGE_PATH" | \
  jq -r '.result'
```

### 示例：批处理介质

```
#!/bin/bash
# process-media.sh - Process multiple media files

for image in images/*.png; do
  echo "Processing $image..."
  agent -p --output-format text \
    "Describe what's in this image: $image" > "${image%.png}.description.txt"
done
```

文件路径可以是相对于当前工作目录或绝对路径的。代理会通过工具调用读取文件，因此确保文件存在且从你执行命令的地方可以访问。
