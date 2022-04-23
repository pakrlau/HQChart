/*
   Copyright (c) 2018 jones
 
    http://www.apache.org/licenses/LICENSE-2.0

   开源项目 https://github.com/jones2000/HQChart
 
   jones_2000@163.com

   封装成交明细表格控件 (H5版本)
*/


function JSDealChart(divElement)
{
    this.DivElement=divElement;
    this.JSChartContainer;              //表格控件

     //h5 canvas
     this.CanvasElement=document.createElement("canvas");
     this.CanvasElement.className='jsdeallist-drawing';
     this.CanvasElement.id=Guid();
     this.CanvasElement.setAttribute("tabindex",0);
     if (this.CanvasElement.style) this.CanvasElement.style.outline='none';
     if(divElement.hasChildNodes())
     {
         JSConsole.Chart.Log("[JSDealChart::JSDealList] divElement hasChildNodes", divElement.childNodes);
     }
     divElement.appendChild(this.CanvasElement);


    this.OnSize=function()
    {
        //画布大小通过div获取
        var height=parseInt(this.DivElement.style.height.replace("px",""));
        this.CanvasElement.height=height;
        this.CanvasElement.width=parseInt(this.DivElement.style.width.replace("px",""));
        this.CanvasElement.style.width=this.CanvasElement.width+'px';
        this.CanvasElement.style.height=this.CanvasElement.height+'px';

        var pixelTatio = GetDevicePixelRatio(); //获取设备的分辨率
        this.CanvasElement.height*=pixelTatio;
        this.CanvasElement.width*=pixelTatio;

        JSConsole.Chart.Log(`[JSDealChart::OnSize] devicePixelRatio=${window.devicePixelRatio}, height=${this.CanvasElement.height}, width=${this.CanvasElement.width}`);

        if (this.JSChartContainer && this.JSChartContainer.OnSize)
        {
            this.JSChartContainer.OnSize();
        } 
    }

    this.SetOption=function(option)
    {
        var chart=this.CreateJSDealChartContainer(option);

        if (!chart) return false;

        if (option.OnCreatedCallback) option.OnCreatedCallback(chart);

        this.JSChartContainer=chart;
        this.DivElement.JSChart=this;   //div中保存一份
        if (!option.Symbol) 
        {
            chart.Draw();
        }
        else
        {
            chart.ChangeSymbol(option.Symbol);
        }
    }

    this.CreateJSDealChartContainer=function(option)
    {
        var chart=new JSDealChartContainer(this.CanvasElement);
        chart.Create(option);

        if (option.NetworkFilter) chart.NetworkFilter=option.NetworkFilter;
        if (IFrameSplitOperator.IsNonEmptyArray(option.Column))  chart.SetColumn(option.Column);

        this.SetChartBorder(chart, option);

        //是否自动更新
        if (option.IsAutoUpdate!=null) chart.IsAutoUpdate=option.IsAutoUpdate;
        if (option.AutoUpdateFrequency>0) chart.AutoUpdateFrequency=option.AutoUpdateFrequency;

        //注册事件
        if (option.EventCallback)
        {
            for(var i=0;i<option.EventCallback.length;++i)
            {
                var item=option.EventCallback[i];
                chart.AddEventCallback(item);
            }
        }

        return chart;
    }

    this.SetChartBorder=function(chart, option)
    {
        if (!option.Border) return;

        var item=option.Border;
        if (IFrameSplitOperator.IsNumber(option.Border.Left)) chart.Frame.ChartBorder.Left=option.Border.Left;
        if (IFrameSplitOperator.IsNumber(option.Border.Right)) chart.Frame.ChartBorder.Right=option.Border.Right;
        if (IFrameSplitOperator.IsNumber(option.Border.Top)) chart.Frame.ChartBorder.Top=option.Border.Top;
        if (IFrameSplitOperator.IsNumber(option.Border.Bottom)) chart.Frame.ChartBorder.Bottom=option.Border.Bottom;

        var pixelTatio = GetDevicePixelRatio(); //获取设备的分辨率
        chart.Frame.ChartBorder.Left*=pixelTatio;
        chart.Frame.ChartBorder.Right*=pixelTatio;
        chart.Frame.ChartBorder.Top*=pixelTatio;
        chart.Frame.ChartBorder.Bottom*=pixelTatio;
    }

    /////////////////////////////////////////////////////////////////////////////
    //对外接口
    
    //切换股票代码接口
    this.ChangeSymbol=function(symbol, option)
    {
        if (this.JSChartContainer) this.JSChartContainer.ChangeSymbol(symbol,option);
    }

    this.SetColumn=function(aryColumn, option)
    {
        if (this.JSChartContainer) this.JSChartContainer.SetColumn(aryColumn,option);
    }

    //事件回调
    this.AddEventCallback=function(obj)
    {
        if(this.JSChartContainer && typeof(this.JSChartContainer.AddEventCallback)=='function')
        {
            JSConsole.Chart.Log('[JSDealChart:AddEventCallback] obj=', obj);
            this.JSChartContainer.AddEventCallback(obj);
        }
    }

    //重新加载配置
    this.ReloadResource=function(option)
    {
        if(this.JSChartContainer && typeof(this.JSChartContainer.ReloadResource)=='function')
        {
            JSConsole.Chart.Log('[JSDealChart:ReloadResource] ');
            this.JSChartContainer.ReloadResource(option);
        }
    }
}


JSDealChart.Init=function(divElement)
{
    var jsChartControl=new JSDealChart(divElement);
    jsChartControl.OnSize();

    return jsChartControl;
}


function JSDealChartContainer(uielement)
{
    this.ClassName='JSDealChartContainer';
    this.Frame;                                     //框架画法
    this.ChartPaint=[];                             //图形画法
    this.ChartSplashPaint=null;                     //等待提示
    this.LoadDataSplashTitle="数据加载中";           //下载数据提示信息
    this.Canvas=uielement.getContext("2d");         //画布
    this.ShowCanvas=null;

    this.Symbol;
    this.Name;
    this.TradeDate;
    this.DealData={ OffsetData:0, Data:[] };         //分笔数据
    this.NetworkFilter;                             //数据回调接口

    //事件回调
    this.mapEvent=new Map();   //通知外部调用 key:JSCHART_EVENT_ID value:{Callback:回调,}

    this.AutoUpdateTimer=null;

    this.LoadDataSplashTitle="数据加载中";           //下载数据提示信息
    
    this.UIElement=uielement;
    this.LastPoint=new Point();     //鼠标位置

    this.IsDestroy=false;        //是否已经销毁了

    this.ChartDestory=function()    //销毁
    {
        this.IsDestroy=true;
        this.StopAutoUpdate();
    }


    //创建
    //windowCount 窗口个数
    this.Create=function(option)
    {
        this.UIElement.JSChartContainer=this;

        //创建等待提示
        this.ChartSplashPaint = new ChartSplashPaint();
        this.ChartSplashPaint.Canvas = this.Canvas;
        this.ChartSplashPaint.SetTitle(this.LoadDataSplashTitle);

        //创建框架
        this.Frame=new JSDealFrame();
        this.Frame.ChartBorder=new ChartBorder();
        this.Frame.ChartBorder.UIElement=this.UIElement;
        this.Frame.ChartBorder.Top=30;
        this.Frame.ChartBorder.Left=5;
        this.Frame.ChartBorder.Bottom=20;
        this.Frame.Canvas=this.Canvas;

        this.ChartSplashPaint.Frame = this.Frame;

        //创建表格
        var chart=new ChartDealList();
        chart.Frame=this.Frame;
        chart.ChartBorder=this.Frame.ChartBorder;
        chart.Canvas=this.Canvas;
        chart.GetEventCallback=(id)=> { return this.GetEventCallback(id); }
        this.ChartPaint[0]=chart;

        var bRegisterKeydown=true;
        var bRegisterWheel=true;

        if (option)
        {
            if (option.KeyDown===false) 
            {
                bRegisterKeydown=false;
                JSConsole.Chart.Log('[JSDealChartContainer::Create] not register keydown event.');
            }

            if (option.Wheel===false) 
            {
                bRegisterWheel=false;
                JSConsole.Chart.Log('[JSDealChartContainer::Create] not register wheel event.');
            }
        }

        if (bRegisterKeydown) this.UIElement.addEventListener("keydown", (e)=>{ this.OnKeyDown(e); }, true);            //键盘消息
        if (bRegisterWheel) this.UIElement.addEventListener("wheel", (e)=>{ this.OnWheel(e); }, true);                  //上下滚动消息
    }

    this.Draw=function()
    {
        if (this.UIElement.width<=0 || this.UIElement.height<=0) return; 

        this.Canvas.clearRect(0,0,this.UIElement.width,this.UIElement.height);
        var pixelTatio = GetDevicePixelRatio(); //获取设备的分辨率
        this.Canvas.lineWidth=pixelTatio;       //手机端需要根据分辨率比调整线段宽度

        if (this.ChartSplashPaint && this.ChartSplashPaint.IsEnableSplash)
        {
            this.Frame.Draw( { IsEnableSplash:this.ChartSplashPaint.IsEnableSplash} );
            this.ChartSplashPaint.Draw();
            return;
        }

        this.Frame.Draw();
        this.Frame.DrawLogo();
       
        //框架内图形
        for(var i=0;i<this.ChartPaint.length;++i)
        {
            var item=this.ChartPaint[i];
            if (item.IsDrawFirst)
                item.Draw();
        }

        for(var i=0; i<this.ChartPaint.length; ++i)
        {
            var item=this.ChartPaint[i];
            if (!item.IsDrawFirst)
                item.Draw();
        }
    }

    this.ChangeSymbol=function(symbol, option)
    {
        this.Symbol=symbol;
        this.DealData=null;

        var chart=this.ChartPaint[0];
        if (chart) chart.Data=null;

        if (option && IFrameSplitOperator.IsNumber(option.TradeDate))
            this.TradeDate=option.TradeDate;

        if (!this.Symbol)
        {
            this.Draw();
            return;
        }

        this.RequestDealData();
    }

    this.CancelAutoUpdate=function()    //关闭停止更新
    {
        if (typeof (this.AutoUpdateTimer) == 'number') 
        {
            clearTimeout(this.AutoUpdateTimer);
            this.AutoUpdateTimer = null;
        }
    }

    this.AutoUpdateEvent=function(bStart, explain)          //自定更新事件, 是给websocket使用
    {
        var eventID=bStart ? JSCHART_EVENT_ID.RECV_START_AUTOUPDATE:JSCHART_EVENT_ID.RECV_STOP_AUTOUPDATE;
        if (!this.mapEvent.has(eventID)) return;

        var self=this;
        var event=this.mapEvent.get(eventID);
        var data={ Stock:{ Symbol:this.Symbol, Name:this.Name, DayCount:this.DayCount }, Explain: explain };
        if (bStart) 
        {
            data.Callback=function(data) //数据到达更新回调
            { 
                self.RecvDealUpdateData(data); 
            }
        }
        event.Callback(event,data,this);
    }

    //全量数据下载
    this.RequestDealData=function()
    {
        this.ChartSplashPaint.SetTitle(this.LoadDataSplashTitle);
        this.ChartSplashPaint.EnableSplash(true);
        this.Draw();

        var self=this;
        if (this.NetworkFilter)
        {
            var obj=
            {
                Name:'JSDealChartContainer::RequestDealData', //类名::
                Explain:'成交明细',
                Request:{ Data: { symbol:self.Symbol, tradeDate:self.TradeDate }  }, 
                Self:this,
                PreventDefault:false
            };
            this.NetworkFilter(obj, function(data) 
            { 
                self.ChartSplashPaint.EnableSplash(false);
                self.RecvDealData(data);
                self.AutoUpdateEvent(true,'JSDealChartContainer::RequestDealData');
                self.AutoUpdate();
            });

            if (obj.PreventDefault==true) return;   //已被上层替换,不调用默认的网络请求
        }

        var cacheUrl=`${g_JSChartResource.CacheDomain}/cache/dealday/today/${this.Symbol}.json`;

        JSNetwork.HttpRequest({
            url: cacheUrl,
            type:"get",
            dataType: "json",
            async:true,
            success: function (data)
            {
                self.ChartSplashPaint.EnableSplash(false);
                self.RecvDealData(data);
                self.AutoUpdate(1);
            },
            error: function(http,e)
            {
                self.ChartSplashPaint.EnableSplash(false);
                self.AutoUpdate();
                //self.RecvError(http,e,param);;
            }
        });
    }

    this.RecvDealData=function(data)
    {
        var aryDeal=JSDealChartContainer.JsonDataToDealData(data);
        this.Data={DataOffset:0,Data:aryDeal };

        this.Symbol=data.symbol;
        this.Name=data.name;

        var chart=this.ChartPaint[0];
        chart.Data=this.Data;
        chart.Symbol=this.Symbol;
        chart.YClose=data.yclose;
        chart.Open=data.open;

        //显示最后一屏
        var pageSize=chart.GetPageSize(true);
        var offset=aryDeal.length-pageSize;
        if (offset<0) offset=0;
        this.Data.DataOffset=offset;

        this.Draw();
    }

    //增量数据下载
    this.RequestDealUpdateData=function()
    {
        var self=this;

        if (this.NetworkFilter)
        {
            var obj=
            {
                Name:'JSDealChartContainer::RequestDealUpdateData', //类名::函数名
                Explain:'增量成交明细',
                Request:{ Data: { symbol: self.Symbol } }, 
                Self:this,
                PreventDefault:false
            };
            this.NetworkFilter(obj, function(data) 
            { 
                self.RecvDealUpdateData(data);
                self.AutoUpdate();
            });

            if (obj.PreventDefault==true) return;  
        }
    }

    this.RecvDealUpdateData=function(data)
    {
        var aryDeal=JSDealChartContainer.JsonDataToDealData(data);
        if (!IFrameSplitOperator.IsNonEmptyArray(aryDeal)) return;

        var lUpdateCount=aryDeal.length;
        if (!this.Data.Data) 
        {
            this.Data.Data=aryDeal;
        }
        else
        {
            for(var i=0;i<aryDeal.length;++i)
            {
                this.Data.Data.push(aryDeal[i]);
                ++this.Data.DataOffset;
            }
        }

        this.Draw();
    }

    this.AutoUpdate=function(waitTime)  //waitTime 更新时间
    {
        this.CancelAutoUpdate();
        if (!this.IsAutoUpdate) return;
        if (!this.Symbol) return;

        var self = this;
        var marketStatus=MARKET_SUFFIX_NAME.GetMarketStatus(this.Symbol);
        if (marketStatus==0 || marketStatus==3) return; //闭市,盘后

        var frequency=this.AutoUpdateFrequency;
        if (marketStatus==1) //盘前
        {
            this.AutoUpdateTimer=setTimeout(function() 
            { 
                self.AutoUpdate(); 
            },frequency);
        }
        else if (marketStatus==2) //盘中
        {
            this.AutoUpdateTimer=setTimeout(function()
            {
                self.RequestDealUpdateData();
            },frequency);
        }
    }

    this.StopAutoUpdate=function()
    {
        this.CancelAutoUpdate();
        this.AutoUpdateEvent(false,'JSDealChartContainer::StopAutoUpdate');
        if (!this.IsAutoUpdate) return;
        this.IsAutoUpdate=false;
    }

    //设置事件回调
    //{event:事件id, callback:回调函数}
    this.AddEventCallback=function(object)
    {
        if (!object || !object.event || !object.callback) return;

        var data={Callback:object.callback, Source:object};
        this.mapEvent.set(object.event,data);
    }

    this.RemoveEventCallback=function(eventid)
    {
        if (!this.mapEvent.has(eventid)) return;

        this.mapEvent.delete(eventid);
    }

    this.GetEventCallback=function(id)  //获取事件回调
    {
        if (!this.mapEvent.has(id)) return null;
        var item=this.mapEvent.get(id);
        return item;
    }

    this.OnSize=function()
    {
        if (!this.Frame) return;

        this.SetSizeChange(true);
        this.Draw();
    }

    this.SetSizeChange=function(bChanged)
    {
        var chart=this.ChartPaint[0];
        if (chart) chart.SizeChange=bChanged;
    }


    this.OnWheel=function(e)    //滚轴
    {
        JSConsole.Chart.Log('[JSDealChartContainer::OnWheel]',e);
        if (this.ChartSplashPaint && this.ChartSplashPaint.IsEnableSplash == true) return;
        if (!this.Data || !IFrameSplitOperator.IsNonEmptyArray(this.Data.Data)) return;

        var x = e.clientX-this.UIElement.getBoundingClientRect().left;
        var y = e.clientY-this.UIElement.getBoundingClientRect().top;

        var isInClient=false;
        this.Canvas.beginPath();
        this.Canvas.rect(this.Frame.ChartBorder.GetLeft(),this.Frame.ChartBorder.GetTop(),this.Frame.ChartBorder.GetWidth(),this.Frame.ChartBorder.GetHeight());
        isInClient=this.Canvas.isPointInPath(x,y);
        if (!isInClient) return;

        var chart=this.ChartPaint[0];
        if (!chart) return;

        var wheelValue=e.wheelDelta;
        if (!IFrameSplitOperator.IsObjectExist(e.wheelDelta))
            wheelValue=e.deltaY* -0.01;

        if (wheelValue<0)   //下一页
        {
            if (this.GotoNextPage()) this.Draw();
        }
        else if (wheelValue>0)  //上一页
        {
            if (this.GotoPreviousPage()) this.Draw();
        }

        if(e.preventDefault) e.preventDefault();
        else e.returnValue = false;
    }

    this.OnKeyDown=function(e)
    {
        if (this.ChartSplashPaint && this.ChartSplashPaint.IsEnableSplash == true) return;

        var keyID = e.keyCode ? e.keyCode :e.which;
        switch(keyID)
        {
            case 38:    //up
                if (this.GotoPreviousPage()) this.Draw();
                break;
            case 40:    //down
                if (this.GotoNextPage()) this.Draw();
                break;
        }

        //不让滚动条滚动
        if(e.preventDefault) e.preventDefault();
        else e.returnValue = false;
    }

    this.GotoNextPage=function()
    {
        if (!this.Data || !IFrameSplitOperator.IsNonEmptyArray(this.Data.Data)) return false;
        var chart=this.ChartPaint[0];
        if (!chart) return false;

        var pageSize=chart.GetPageSize();
        if (pageSize>this.Data.Data.length) return false;

        var offset=this.Data.DataOffset+pageSize;
        if (offset+pageSize==this.Data.Data.length-1) return false;

        if (offset+pageSize>this.Data.Data.length)  //最后一页不够一屏调整到满屏
        {
            this.Data.DataOffset=this.Data.Data.length-pageSize;
        }
        else
        {
            this.Data.DataOffset=offset;
        }
        return true;
    }

    this.GotoPreviousPage=function()
    {
        if (!this.Data || !IFrameSplitOperator.IsNonEmptyArray(this.Data.Data)) return false;
        var chart=this.ChartPaint[0];
        if (!chart) return false;
        if (this.Data.DataOffset<=0) return false;

        var pageSize=chart.GetPageSize();
        var offset=this.Data.DataOffset;
        offset-=pageSize;
        if (offset<0) offset=0;
        this.Data.DataOffset=offset;
        return true;
    }

    this.SetColumn=function(aryColunm, option)
    {
        var chart=this.ChartPaint[0];
        if (chart) 
        {
            chart.SetColumn(aryColunm);
            chart.SizeChange=true;

            if (option && option.Redraw) this.Draw();
        }
    }

    this.ReloadResource=function(option)
    {
        this.Frame.ReloadResource(option);
        
        for(var i=0;i<this.ChartPaint.length;++i)
        {
            var item=this.ChartPaint[i];
            if (item.ReloadResource) item.ReloadResource(option);
        }

        if (option && option.Redraw)
        {
            this.SetSizeChange(true);
            this.Draw();
        }
    }

}


JSDealChartContainer.JsonDataToDealData=function(data)
{
    var symbol=data.symbol;
    var result=[];
    if (!IFrameSplitOperator.IsNonEmptyArray(data.detail)) return result;

    //0=时间 1=价格 2=成交量 3=成交金额 4=BS 5=字符串时间 6=ID
    for(var i=0;i<data.detail.length;++i)
    {
        var item=data.detail[i];
        
        var dealItem={ Time:item[0], Price:item[1], Vol:item[2], BS:item[4], Amount:item[3] };
        dealItem.Source=item;

        if (item[5]) dealItem.StrTime=item[4];
        if (item[6]) dealItem.ID=item[4];

        result.push(dealItem);
    }

    return result;
}


function JSDealFrame()
{
    this.ChartBorder;
    this.Canvas;                            //画布

    this.BorderColor=g_JSChartResource.DealList.BorderColor;    //边框线

    this.LogoTextColor=g_JSChartResource.FrameLogo.TextColor;
    this.LogoTextFont=g_JSChartResource.FrameLogo.Font;

    this.ReloadResource=function(resource)
    {
        this.BorderColor=g_JSChartResource.DealList.BorderColor;    //边框线
        this.LogoTextColor=g_JSChartResource.FrameLogo.TextColor;
        this.LogoTextFont=g_JSChartResource.FrameLogo.Font;
    }

    this.Draw=function(option)
    {
        if (option && option.IsEnableSplash===true)
        {
            var left=ToFixedPoint(this.ChartBorder.GetLeft());
            var top=ToFixedPoint(this.ChartBorder.GetTop());
            var right=ToFixedPoint(this.ChartBorder.GetRight());
            var bottom=ToFixedPoint(this.ChartBorder.GetBottom());
            var width=right-left;
            var height=bottom-top;

            this.Canvas.strokeStyle=this.BorderColor;
            this.Canvas.strokeRect(left,top,width,height);
        }
    }

    this.DrawLogo=function()
    {
        var text=g_JSChartResource.FrameLogo.Text;
        if (!IFrameSplitOperator.IsString(text)) return;

        this.Canvas.fillStyle=this.LogoTextColor;
        this.Canvas.font=this.LogoTextFont;
        this.Canvas.textAlign = 'left';
        this.Canvas.textBaseline = 'bottom';
       
        var x=this.ChartBorder.GetLeft()+5;
        var y=this.ChartBorder.GetBottom()-5;
        this.Canvas.fillText(text,x,y); 
    }
}

var DEAL_COLUMN_ID=
{
    TIME_ID:0,      //时间
    PRICE_ID:1,     //成交价格
    VOL_ID:2,       //成交量
    DEAL_ID:3,      //成交笔数
    BS_ID:4,
    UPDOWN_ID:5,        //涨跌
    STRING_TIME_ID:6,   //字符串时间
}

function ChartDealList()
{
    this.Canvas;                        //画布
    this.ChartBorder;                   //边框信息
    this.ChartFrame;                    //框架画法
    this.Name;                          //名称
    this.ClassName='ChartDealList';     //类名
    this.IsDrawFirst=false;
    this.GetEventCallback;
    this.Data;                          //数据 { Data:[ { Time:, Price:, Vol:, BS:, StrTime } ], Offset: }
    //this.Data={Offset:0, Data:[ {Time:925, Price:20.1, Vol:10000050, BS:1, Deal:45 }, {Time:925, Price:18.2, Vol:1150, BS:1, Deal:5 }] };
    this.Symbol;
    this.YClose;    //昨收
    this.Open;      //开盘价
    this.Decimal=2; //小数位数

    this.SizeChange=true;

    //涨跌颜色
    this.UpColor=g_JSChartResource.DealList.UpTextColor;
    this.DownColor=g_JSChartResource.DealList.DownTextColor;
    this.UnchagneColor=g_JSChartResource.DealList.UnchagneTextColor; 

    this.BorderColor=g_JSChartResource.DealList.BorderColor;    //边框线

    //表头配置
    this.HeaderFontConfig={ Size:g_JSChartResource.DealList.Header.Font.Size, Name:g_JSChartResource.DealList.Header.Font.Name };
    this.HeaderColor=g_JSChartResource.DealList.Header.Color;
    this.HeaderMergin=
    { 
        Left:g_JSChartResource.DealList.Header.Mergin.Left, 
        Right:g_JSChartResource.DealList.Header.Mergin.Right, 
        Top:g_JSChartResource.DealList.Header.Mergin.Top, 
        Bottom:g_JSChartResource.DealList.Header.Mergin.Bottom
    };

    //表格内容配置
    this.ItemFontConfig={ Size:g_JSChartResource.DealList.Row.Font.Size, Name:g_JSChartResource.DealList.Row.Font.Name };
    this.RowMergin={ Top:g_JSChartResource.DealList.Row.Mergin.Top, Bottom:g_JSChartResource.DealList.Row.Mergin.Bottom };

    //缓存
    this.HeaderFont=12*GetDevicePixelRatio() +"px 微软雅黑";
    this.ItemFont=15*GetDevicePixelRatio() +"px 微软雅黑";
    this.RowCount=0;
    this.TableWidth=0;
    this.TableCount=0;
    this.HeaderHeight=0;

    this.Column=
    [
        { Type:DEAL_COLUMN_ID.TIME_ID, Title:"时间", TextAlign:"center", Width:null, TextColor:g_JSChartResource.DealList.FieldColor.Time, MaxText:"88:88:88" , Foramt:"HH:MM:SS"},
        { Type:DEAL_COLUMN_ID.PRICE_ID, Title:"价格", TextAlign:"center", Width:null,  MaxText:"888888.88"},
        { Type:DEAL_COLUMN_ID.VOL_ID, Title:"成交", TextAlign:"right", Width:null, TextColor:g_JSChartResource.DealList.FieldColor.Vol, MaxText:"888888"},
        { Type:DEAL_COLUMN_ID.BS_ID, Title:"", TextAlign:"right", Width:null, MaxText:"擎" }
    ];

    this.RectClient={};

    this.ReloadResource=function(resource)
    {
        this.UpColor=g_JSChartResource.DealList.UpTextColor;
        this.DownColor=g_JSChartResource.DealList.DownTextColor;
        this.UnchagneColor=g_JSChartResource.DealList.UnchagneTextColor; 
    
        this.BorderColor=g_JSChartResource.DealList.BorderColor;    //边框线

        //表头配置
        this.HeaderFontConfig={ Size:g_JSChartResource.DealList.Header.Font.Size, Name:g_JSChartResource.DealList.Header.Font.Name };
        this.HeaderColor=g_JSChartResource.DealList.Header.Color;
        this.HeaderMergin=
        { 
            Left:g_JSChartResource.DealList.Header.Mergin.Left, 
            Right:g_JSChartResource.DealList.Header.Mergin.Right, 
            Top:g_JSChartResource.DealList.Header.Mergin.Top, 
            Bottom:g_JSChartResource.DealList.Header.Mergin.Bottom
        };

        //表格内容配置
        this.ItemFontConfig={ Size:g_JSChartResource.DealList.Row.Font.Size, Name:g_JSChartResource.DealList.Row.Font.Name };
        this.RowMergin={ Top:g_JSChartResource.DealList.Row.Mergin.Top, Bottom:g_JSChartResource.DealList.Row.Mergin.Bottom };

        for(var i=0;i<this.Column.length;++i)
        {
            var item=this.Column[i];
            if (item.Type==DEAL_COLUMN_ID.TIME_ID || item.Type==DEAL_COLUMN_ID.STRING_TIME_ID) 
                item.TextColor=g_JSChartResource.DealList.FieldColor.Time;
            else if (item.Type==DEAL_COLUMN_ID.VOL_ID) 
                item.TextColor=g_JSChartResource.DealList.FieldColor.Vol;
            else if (item.Type==DEAL_COLUMN_ID.DEAL_ID) 
                item.TextColor=g_JSChartResource.DealList.FieldColor.Deal;
        }
    }


    this.SetColumn=function(aryColumn)
    {
        if (!IFrameSplitOperator.IsNonEmptyArray(aryColumn)) return;

        this.Column=[];
        for(var i=0;i<aryColumn.length;++i)
        {
            var item=aryColumn[i];
            var colItem=this.GetDefaultColunm(item.Type);
            if (!colItem) continue;

            if (item.Title) colItem.Title=item.Title;
            if (item.TextAlign) colItem.TextAlign=item.TextAlign;
            if (item.TextColor) colItem.TextColor=item.TextColor;
            if (item.MaxText) colItem.MaxText=item.MaxText;

            this.Column.push(colItem);
        }
    }

    this.GetDefaultColunm=function(id)
    {
        var DEFAULT_COLUMN=
        [
            { Type:DEAL_COLUMN_ID.TIME_ID, Title:"时间", TextAlign:"center", Width:null , TextColor:g_JSChartResource.DealList.FieldColor.Time, MaxText:"88:88:88", Foramt:"HH:MM:SS" },
            { Type:DEAL_COLUMN_ID.PRICE_ID, Title:"价格", TextAlign:"center", Width:null,  MaxText:"888888.88"},
            { Type:DEAL_COLUMN_ID.VOL_ID, Title:"成交", TextAlign:"right", Width:null, TextColor:g_JSChartResource.DealList.FieldColor.Vol, MaxText:"888888"},
            { Type:DEAL_COLUMN_ID.BS_ID, Title:"", TextAlign:"right", Width:null,MaxText:"擎" },
            { Type:DEAL_COLUMN_ID.DEAL_ID, Title:"笔数", TextAlign:"right", Width:null, TextColor:g_JSChartResource.DealList.FieldColor.Deal , MaxText:"8888"},
            { Type:DEAL_COLUMN_ID.UPDOWN_ID, Title:"涨跌", TextAlign:"right", Width:null,  MaxText:"-8888.88"},
            { Type:DEAL_COLUMN_ID.STRING_TIME_ID, Title:"时间", TextAlign:"center", Width:null, TextColor:g_JSChartResource.DealList.FieldColor.Time, MaxText:"88:88:88" }
        ];

        for(var i=0;i<DEFAULT_COLUMN.length;++i)
        {
            var item=DEFAULT_COLUMN[i];
            if (item.Type==id) return item;
        }

        return null;
    }


    this.Draw=function()
    {
        if (this.SizeChange) this.CalculateSize();
        else this.UpdateCacheData();

        this.DrawBorder();
        this.DrawHeader();
        this.DrawBody();

        this.SizeChange=false;
    }

    //更新缓存变量
    this.UpdateCacheData=function()
    {
        this.RectClient.Left=this.ChartBorder.GetLeft();
        this.RectClient.Right=this.ChartBorder.GetRight();
        this.RectClient.Top=this.ChartBorder.GetTop();
        this.RectClient.Bottom=this.ChartBorder.GetBottom();
        this.Decimal=GetfloatPrecision(this.Symbol);
    }

    this.GetPageSize=function(recalculate) //recalculate 是否重新计算
    {
        if (recalculate) this.CalculateSize();

        var size=this.TableCount*this.RowCount;

        return size;
    }

    this.CalculateSize=function()   //计算大小
    {
        this.UpdateCacheData();

        var pixelRatio=GetDevicePixelRatio();
        this.HeaderFont=`${this.HeaderFontConfig.Size*pixelRatio}px ${ this.HeaderFontConfig.Name}`;
        this.ItemFont=`${this.ItemFontConfig.Size*pixelRatio}px ${ this.ItemFontConfig.Name}`;

        this.Canvas.font=this.ItemFont;
        
        var sumWidth=0, itemWidth=0;
        for(var i=0;i<this.Column.length;++i)
        {
            var item=this.Column[i];
            itemWidth=this.Canvas.measureText(item.MaxText).width;
            item.Width=itemWidth+4;
            sumWidth+=item.Width;
        }

        var clientWidth=this.RectClient.Right-this.RectClient.Left;
        this.TableCount=parseInt(clientWidth/sumWidth);
        this.TableWidth=clientWidth/this.TableCount;

        this.HeaderHeight=this.GetFontHeight(this.HeaderFont,"擎")+ this.HeaderMergin.Top+ this.HeaderMergin.Bottom;
        this.RowHeight=this.GetFontHeight(this.ItemFont,"擎")+ this.HeaderMergin.Top+ this.HeaderMergin.Bottom;
        this.RowCount=parseInt((this.RectClient.Bottom-this.RectClient.Top-this.HeaderHeight)/this.RowHeight);
    }

    this.DrawHeader=function()
    {
        var left=this.RectClient.Left+this.HeaderMergin.Left;
        var top=this.RectClient.Top;
        var y=top+this.HeaderMergin.Top+(this.HeaderHeight-this.HeaderMergin.Top-this.HeaderMergin.Bottom)/2;

        this.Canvas.font=this.HeaderFont;
        this.Canvas.fillStyle=this.HeaderColor;
        for(var i=0, j=0;i<this.TableCount;++i)
        {
            var tableLeft=left+(this.TableWidth*i);
            var textLeft=tableLeft;
            for(j=0;j<this.Column.length;++j)
            {
                var item=this.Column[j];
                var itemWidth=item.Width;
                if (j==this.Column.length-1) itemWidth=this.TableWidth-(textLeft-tableLeft)-this.HeaderMergin.Right-this.HeaderMergin.Left;
                var x=textLeft;
                if (item.TextAlign=='center')
                {
                    x=textLeft+itemWidth/2;
                    this.Canvas.textAlign="center";
                }
                else if (item.TextAlign=='right')
                {
                    x=textLeft+itemWidth;
                    this.Canvas.textAlign="right";
                }
                else
                {
                    this.Canvas.textAlign="left";
                }

                
                this.Canvas.textBaseline="middle";
                this.Canvas.fillText(item.Title,x,y);

                textLeft+=item.Width;
            } 
        }
    }

    this.DrawBorder=function()
    {
        var left=ToFixedPoint(this.RectClient.Left);
        var right=ToFixedPoint(this.RectClient.Right);
        var top=ToFixedPoint(this.RectClient.Top);
        var bottom=ToFixedPoint(this.RectClient.Bottom);

        this.Canvas.strokeStyle=this.BorderColor;
        this.Canvas.beginPath();
        this.Canvas.moveTo(left,top);
        this.Canvas.lineTo(right,top);

        this.Canvas.moveTo(left,top+this.HeaderHeight);
        this.Canvas.lineTo(right,top+this.HeaderHeight);

        this.Canvas.moveTo(left,bottom);
        this.Canvas.lineTo(right,bottom);

        this.Canvas.moveTo(left,top);
        this.Canvas.lineTo(left,bottom);

        this.Canvas.moveTo(right,top);
        this.Canvas.lineTo(right,bottom);

        var tableLeft=ToFixedPoint(left+this.TableWidth);
        for(var i=1;i<this.TableCount;++i)
        {
            this.Canvas.moveTo(tableLeft,top);
            this.Canvas.lineTo(tableLeft,bottom);

            tableLeft=ToFixedPoint(tableLeft+this.TableWidth);
        }

        this.Canvas.stroke();
    }

    this.DrawBody=function()
    {
        if (!this.Data) return;
        if (!IFrameSplitOperator.IsNonEmptyArray(this.Data.Data)) return;

        this.Canvas.font=this.ItemFont;
        var top=this.RectClient.Top+this.HeaderHeight;
        var left=this.RectClient.Left+this.HeaderMergin.Left;
        var dataCount=this.Data.Data.length;
        var index=this.Data.DataOffset;
        for(var i=0,j=0;i<this.TableCount;++i)
        {
            var tableLeft=left+(this.TableWidth*i);
            var textLeft=tableLeft;
            var textTop=top;
            for(j=0;j<this.RowCount && index<dataCount;++j, ++index)
            {
                var dataItem=this.Data.Data[index];

                this.DrawRow(dataItem, textLeft, textTop);

                textTop+=this.RowHeight;
            }
        }
    }

    this.DrawRow=function(data, left, top)
    {
        var tableLeft=left;
        for(var i=0;i<this.Column.length;++i)
        {
            var item=this.Column[i];
            var textColor=item.TextColor;
            var text=null;
            if (item.Type==DEAL_COLUMN_ID.TIME_ID)
            {
                text=IFrameSplitOperator.FormatTimeString(data.Time,item.Foramt);
            }
            else if (item.Type==DEAL_COLUMN_ID.PRICE_ID)
            {
                if (data.Price>this.YClose) textColor=this.UpColor;
                else if (data.Price<this.YClose) textColor=this.DownColor;
                else textColor=this.UnchagneColor;

                text=data.Price.toFixed(this.Decimal);
            }
            else if (item.Type==DEAL_COLUMN_ID.VOL_ID)
            {
                text=IFrameSplitOperator.FormatValueString(data.Vol,0);
                textColor=this.GetVolColor(item, data);
            }
            else if (item.Type==DEAL_COLUMN_ID.DEAL_ID)
            {
                text=IFrameSplitOperator.FormatValueString(data.Deal,0);
            }
            else if (item.Type==DEAL_COLUMN_ID.BS_ID)
            {
                if (data.BS==1) 
                {
                    text="B";
                    textColor=this.UpColor;
                }
                else if (data.BS==2)
                {
                    text="S";
                    textColor=this.DownColor;
                }
            }
            else if (item.Type==DEAL_COLUMN_ID.UPDOWN_ID)
            {
                if (IFrameSplitOperator.IsNumber(this.YClose))
                {
                    var value=data.Price-this.YClose;
                    text=value.toFixed(2);

                    if (value>0) textColor=this.UpColor;
                    else if (value<0) textColor=this.DownColor;
                    else textColor=this.UnchagneColor;
                }
            }

            var itemWidth=item.Width;
            if (i==this.Column.length-1) itemWidth=this.TableWidth-(left-tableLeft)-this.HeaderMergin.Right-this.HeaderMergin.Left;
            var x=left;
            if (item.TextAlign=='center')
            {
                x=left+itemWidth/2;
                this.Canvas.textAlign="center";
            }
            else if (item.TextAlign=='right')
            {
                x=left+itemWidth;
                this.Canvas.textAlign="right";
            }
            else
            {
                this.Canvas.textAlign="left";
            }


            this.Canvas.textBaseline="middle";
            this.Canvas.fillStyle=textColor;
            if (text) this.Canvas.fillText(text,x,top+this.RowHeight/2);

            left+=item.Width;
        }
    }

    this.GetVolColor=function(colunmInfo, data)
    {
        var event=this.GetEventCallback(JSCHART_EVENT_ID.ON_DRAW_DEAL_VOL_COLOR);
        if (event && event.Callback)
        {
            var sendData={ Data:data, TextColor:null };
            event.Callback(event,sendData,this);
            if (sendData.TextColor) return sendData.TextColor;
        }

        return colunmInfo.TextColor;
    }

    this.GetFontHeight=function(font,word)
    {
        return GetFontHeight(this.Canvas, font, word);
    }
}
