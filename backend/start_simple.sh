#!/bin/bash

# 公考督学助手后端服务管理脚本
# 使用conda环境启动和停止服务

# 配置
CONDA_ENV="zhuzhen-backend"
CONDA_PATH="/root/miniconda3"
UVICORN_PATH="$CONDA_PATH/envs/$CONDA_ENV/bin/uvicorn"
PID_FILE="/data/zhuzhen/logs/uvicorn.pid"
LOG_FILE="/data/zhuzhen/logs/uvicorn.log"
DATABASE_URL="sqlite+aiosqlite:///./data/app.db"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检查conda环境
check_conda() {
    if [ ! -f "$UVICORN_PATH" ]; then
        log_error "Conda环境 $CONDA_ENV 不存在或uvicorn未安装"
        exit 1
    fi
}

# 创建必要目录
create_dirs() {
    mkdir -p /data/zhuzhen/logs
    mkdir -p /srv/zhuzhen/MVP_zhuzhen/backend/data
}

# 启动服务
start_service() {
    log_info "启动公考督学助手后端服务..."
    
    # 检查是否已经在运行
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log_warn "服务已经在运行中 (PID: $(cat $PID_FILE))"
        return 0
    fi
    
    # 检查端口是否被占用
    if netstat -tlnp 2>/dev/null | grep -q ":8000 "; then
        log_error "端口8000已被占用，请先停止其他服务"
        return 1
    fi
    
    # 创建目录
    create_dirs
    
    # 启动服务
    cd /srv/zhuzhen/MVP_zhuzhen/backend
    DATABASE_URL="$DATABASE_URL" nohup "$UVICORN_PATH" app.main:app --host 0.0.0.0 --port 8000 --workers 4 > "$LOG_FILE" 2>&1 &
    
    # 保存PID
    echo $! > "$PID_FILE"
    
    # 等待服务启动
    sleep 3
    
    # 检查服务是否启动成功
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log_info "服务启动成功！"
        log_info "PID: $(cat $PID_FILE)"
        log_info "日志文件: $LOG_FILE"
        log_info "API文档: http://localhost:8000/docs"
        return 0
    else
        log_error "服务启动失败，请检查日志: $LOG_FILE"
        return 1
    fi
}

# 停止服务
stop_service() {
    log_info "停止公考督学助手后端服务..."
    
    # 首先尝试通过PID文件停止
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log_info "通过PID停止服务: $PID"
            kill "$PID"
            sleep 2
            
            # 强制杀死如果还在运行
            if kill -0 "$PID" 2>/dev/null; then
                log_warn "强制停止服务..."
                kill -9 "$PID"
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # 查找并停止所有相关的uvicorn进程
    log_info "查找并停止所有uvicorn进程..."
    PIDS=$(pgrep -f "uvicorn app.main:app")
    if [ -n "$PIDS" ]; then
        log_info "发现uvicorn进程: $PIDS"
        for pid in $PIDS; do
            kill "$pid" 2>/dev/null
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "强制停止进程: $pid"
                kill -9 "$pid" 2>/dev/null
            fi
        done
    fi
    
    # 查找并停止所有相关的python进程（uvicorn worker进程）
    log_info "查找并停止所有相关python进程..."
    PYTHON_PIDS=$(pgrep -f "python.*uvicorn\|python.*app.main")
    if [ -n "$PYTHON_PIDS" ]; then
        log_info "发现python进程: $PYTHON_PIDS"
        for pid in $PYTHON_PIDS; do
            kill "$pid" 2>/dev/null
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "强制停止进程: $pid"
                kill -9 "$pid" 2>/dev/null
            fi
        done
    fi
    
    # 等待端口释放
    sleep 2
    
    # 检查端口是否已释放
    if netstat -tlnp 2>/dev/null | grep -q ":8000 "; then
        log_warn "端口8000仍被占用，尝试强制释放..."
        # 强制杀死占用8000端口的进程
        PORT_PID=$(netstat -tlnp 2>/dev/null | grep ":8000 " | awk '{print $7}' | cut -d'/' -f1)
        if [ -n "$PORT_PID" ]; then
            log_warn "强制停止占用端口8000的进程: $PORT_PID"
            kill -9 "$PORT_PID" 2>/dev/null
        fi
    fi
    
    log_info "服务停止完成"
}

# 重启服务
restart_service() {
    log_info "重启公考督学助手后端服务..."
    stop_service
    sleep 2
    start_service
}

# 查看状态
status_service() {
    log_info "检查服务状态..."
    
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        PID=$(cat "$PID_FILE")
        log_info "服务正在运行 (PID: $PID)"
        
        # 检查端口
        if netstat -tlnp 2>/dev/null | grep -q ":8000 "; then
            log_info "端口8000正在监听"
        else
            log_warn "端口8000未监听"
        fi
        
        # 测试健康检查
        if curl -f http://localhost:8000/health >/dev/null 2>&1; then
            log_info "健康检查: 正常"
        else
            log_warn "健康检查: 失败"
        fi
    else
        log_warn "服务未运行"
    fi
}

# 查看日志
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        log_info "显示最近的日志 (最后20行):"
        tail -20 "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
    fi
}

# 连续监控日志
follow_logs() {
    if [ -f "$LOG_FILE" ]; then
        log_info "开始连续监控日志 (按 Ctrl+C 停止):"
        log_info "日志文件: $LOG_FILE"
        echo ""
        tail -f "$LOG_FILE"
    else
        log_warn "日志文件不存在: $LOG_FILE"
        log_info "等待日志文件创建..."
        # 等待日志文件创建
        while [ ! -f "$LOG_FILE" ]; do
            sleep 1
        done
        log_info "日志文件已创建，开始监控..."
        tail -f "$LOG_FILE"
    fi
}

# 过滤日志
filter_logs() {
    local filter="$1"
    if [ -z "$filter" ]; then
        log_error "请指定过滤条件"
        echo "用法: $0 filter <过滤条件>"
        echo "示例: $0 filter ERROR"
        echo "示例: $0 filter 'GET /'"
        return 1
    fi
    
    if [ -f "$LOG_FILE" ]; then
        log_info "过滤日志 (包含: $filter):"
        tail -f "$LOG_FILE" | grep --line-buffered "$filter"
    else
        log_warn "日志文件不存在: $LOG_FILE"
    fi
}

# 主函数
main() {
    case "$1" in
        start)
            check_conda
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            check_conda
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            show_logs
            ;;
        follow)
            follow_logs
            ;;
        filter)
            filter_logs "$2"
            ;;
        *)
            echo "用法: $0 {start|stop|restart|status|logs|follow|filter}"
            echo ""
            echo "命令说明:"
            echo "  start   - 启动服务"
            echo "  stop    - 停止服务"
            echo "  restart - 重启服务"
            echo "  status  - 查看服务状态"
            echo "  logs    - 查看服务日志 (最近20行)"
            echo "  follow  - 连续监控日志 (实时)"
            echo "  filter  - 过滤监控日志"
            echo ""
            echo "过滤日志示例:"
            echo "  $0 filter ERROR     # 只显示错误日志"
            echo "  $0 filter 'GET /'   # 只显示GET请求"
            echo "  $0 filter INFO      # 只显示INFO级别日志"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"