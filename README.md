# markdown-tg-mode
Codemirror Telegram Markdown Mode


Test case that should be supported:

    *bold text* 
    _italic text_ 
    [inline URL](http://www.example.com/) 
    [inline mention of a user](tg://user?id=123456789) 
    `inline fixed-width code` 
    ```block_language pre-formatted 
    fixed-width code block ``` 

    #hash 
    @username
    http://link/to (http link) 
    https://link/to (https link) 
    ftp://link/to (ftp link) 
    tg://user (tg link) 
    
