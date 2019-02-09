// 2018/05/08のchatworkのマイナーアップデートにより、
// 要素の読み込みタイミングが変更したため、Chrome拡張のJSのタイミングと合わなくなり
// 拡張が動かないことが生じた。
// window.load, manifest.jsonのrun_atをdocument_idleにしても対応できず、暫定的な対応として物理的に遅延させてからスクリプトファイルを読み込むという
// 処理にした。そのため、main関数で全てを包むという暴挙にでている。
// 別の対応策がわかり次第要修正
setTimeout(main, 1000);

function main() {

    // APIを使わない形式にしたのでコメントアウト
    // localStorage.removeItem('contacts');
    // getContacts();
    setToSendBtn()

    /**
     * To送信ボタンを設置する
     *
     * @return void
     */
    function setToSendBtn() {
        $('#_sendEnterActionArea').after(createToSendBtn());
    }

    /**
     * To送信ボタンのHTML要素を作成
     *
     * @return string To送信ボタンのHTML
     */
    function createToSendBtn() {
        return '<button id="to_send" class="chatInput__submit _cwBN button icoFontTo" style="color:#fff;background-color:#B84545;font-size:13px;margin-left:10px;margin-right:5px;font-weight:bold" > 送信</button>';
    }

    /**
     * 現在開いているチャットのroom_idを取得する
     *
     * @return string room_id
     */
    function getRoomId() {
        return location.href.split('rid')[1];
    }

    /**
     * アクセストークンを取得
     *
     * @return string アクセストークン
     */
    function getAccessToken() {
        var src = document.getElementsByTagName("html")[0].innerHTML;
        var token_row = src.match(/ACCESS_TOKEN.*\D;/); //HTMLソースからACCESS_TOKENの行を抽出
        return token_row[0].match(/'((?:(?:(?!\\).)?(?:(?:\\\\)*\\)'|[^'])*)'/)[1]; // シングルクォートで囲まれたACCESS_TOKENを抽出
    }

    /**
     * 自分のアカウントID・名前・アイコンURLを取得
     *
     * @return array 'id','user_name','icon_image'をキーとした連想配列
     */
    function getMyStatus() {
        var my_status_icon = $('#_myStatusIcon').children('img');
        var icon_image = my_status_icon.attr('src');
        var my_id = my_status_icon.attr('data-aid');
        var my_name = $('#_myStatusName').children('span')[0].innerHTML;
        return {'id':my_id,'user_name':my_name, 'icon_image':icon_image}
    }


    /**
     * To送信ボタンを押下時の処理
     *
     * @return {[type]} [description]
     */
    $('#to_send').click(function() {
        visibleAllChatRooms();
        var obj = getChatSendArea();
        var current_room_id = getRoomId();
        toSend(obj['id_arr'], obj['msg'], current_room_id);
    });

    /**
     * 全てのチャットルームを画面上に見えた状態にする
     *
     * @return void
     */
    function visibleAllChatRooms() {
        var room_more_element = $('.roomLimitOver__moreLoadButton');
        while(room_more_element.length > 0) {
            room_more_element.click();
            room_more_element = $(".roomLimitOver__moreLoadButton");
        }
    }

    /**
     * 送信するチャットメッセージと送信対象のIDを取得
     *
     * @return array 'id_arr','msg'をKeyとし、to送信するユーザーのIDを格納した配列, 送信するメッセージをValueとした連想配列
     */
    function getChatSendArea() {
        var msg = $("#_chatText").val();
        var to_rows = msg.match(/\[To:[0-9]{7}\]/g); //[To:1234567]だけを抽出した配列
        var id_arr = new Array(); // 1234567だけを抽出した配列
        for (var i = 0; i < to_rows.length; i++) {
            id_arr.push(to_rows[i].match(/[0-9]{7}/g)[0]);
        }
        return {'id_arr':id_arr, 'msg':msg}
    }

    /**
     * 対象のユーザーにTo送信する（メイン処理）
     * 対象のユーザーIDからルームIDを取得し、ajaxによって直接APIを叩き、to送信したように見せる。
     * 補足）APIを利用しているわけではない。ただPOSTしているだけ。
     *
     * @param array id_arr 対象ユーザーのIDが格納された配列
     * @param string msg   メッセージ
     * @param string current_room_id 現在いるチャットルームのID
     * @return void
     */
    function toSend(id_arr, msg, current_room_id) {
        var my_id = getMyStatus()['id'];
        var token = getAccessToken();
        var room_ids = new Array();
        var avatar_urls = new Array();

        // ユーザーIDからアバターの画像URLを取得
        for (var i = 0; i < id_arr.length; i++) {
            avatar_urls.push(getAvatarURLByUserId(id_arr[i]))
        }

        // アバターの画像URLからルームIDを取得
        for (var i = 0; i < avatar_urls.length; i++) {
            room_ids.push(getRoomIdByAvatarURL(avatar_urls[i]));
        }

        // チャットを送る
        for (var i = 0; i < room_ids.length; i++) {
            if(room_ids[i] == null) {
                continue;
            }
            result = postChatworkSendApi(my_id, token, msg, room_ids[i]);
            $("#_chatText").val('');
        }
    }

    /**
     * ユーザーIDからその人のニックネームではなく本名を取得
     *
     * @param string user_id ユーザーID
     * @return int ルームID
     */
    function getNameByUserId(user_id) {
        var contacts = JSON.parse(localStorage.getItem('contacts'));
        if(contacts == null) {
            // ここに来た場合、ajaxの遅延により一度TO送信ボタンを押しただけではcontactsが取得できない(取得する前に処理に移ってしまう)
            // ajaxの処理が終わったときに、という処理をしても良かったがajax内が複雑になりそうなので一旦保留。
            // Chatworkに来た瞬間にgetContacts()をしているため、ここに来ることはないとは思うが念の為。
            contacts = getContacts();
        }
        var contacts_length = contacts.length;
        // forEachは途中でreturnできないためforを使用する
        for (var i = 0; i < contacts_length; i++) {
            var account_id = contacts[i]['account_id'];
            if(account_id == user_id) {
                return contacts[i]['name'];
            }
        }
    }

    /**
     * ユーザー名(本名)からルームIDを取得
     *
     * 2018/07/19時点でChatworkのDOM要素の変更があった。DOMの名称変更と以前まであった属性が削除された等の変更。
     * これにより、APIを使用しないとアカウントIDからルームIDをが取得できなくなったのでこのような実装にしている。(アカウントIDでルームIDが判別できなくなった)
     * 以前は属性としてルームIDがあったのでアカウントIDから人物とルームIDを一致させることができた。
     *
     * @param  string $user_name ユーザー名(本名)
     * @return string room_id
     */
    function getRoomIdByUserName(user_name) {
        var rooms = $('roomlist').find('li');
        var rooms_length = rooms.length;
        for (var i = 0; i < rooms_length; i++) {
            var room_user_name = $(rooms[i]).find('.roomListItem__roomName').html();
            if(room_user_name === user_name) {
                return $(rooms[i]).attr('data-rid');
            }
        }
    }

    /**
     * ユーザーIDからアバターの画像URLを取得する
     *
     * 対象ユーザーのルームIDを取得するためにアバターのURLを使用するため。
     * ユーザーIDとルームIDを紐つけるものがアバターURLしかなかったため本メソッドを作成。
     *
     * @param user_id $user_id 対象ユーザーのID
     * @return string アバターの画像URL
     */
    function getAvatarURLByUserId(user_id) {
        var to_list = $('#_toList').children('._cwLTList');
        var user_imgs = $(to_list).find('li').children('img');
        var user_imgs_length = user_imgs.length;
        var avatar_urls = new Array()
            for(i = 0; i < user_imgs_length; i++) {
                if($(user_imgs[i]).attr('data-aid') === user_id) {
                    return $(user_imgs[i]).attr('src')
                }
            }
    }

    /**
     * アバターの画像URLからルームIDを取得
     *
     * @param target_avatar_url $target_avatar_url アバターの画像URLを
     * @return ルームID
     */
    function getRoomIdByAvatarURL(target_avatar_url) {
        var rooms = $('roomlist').find('li');
        var rooms_length = rooms.length;
        for (var i = 0; i < rooms_length; i++) {
            var avatar = $(rooms[i]).find('.avatarMedium');
            var avatar_url = $(avatar).attr('src');
            if(avatar_url === target_avatar_url) {
                return $(rooms[i]).attr('data-rid');
            }
        }
    }

    /**
     * チャットワークのsendAPIを叩く
     *
     * @param string my_id   自分のID
     * @param string token   トークン
     * @param string text    送信するメッセージ
     * @param string room_id 送信対象のルームID
     * @return void
     */
    function postChatworkSendApi(my_id, token, text, room_id) {
        var post_data = { text: text, _t:token }
        $.ajax('https://kcw.kddi.ne.jp/gateway/send_chat.php?myid=' + my_id + '&_v=1.80a&_av=5&ln=ja&room_id=' + room_id + '&read=1&edit_id=0', {
            type: 'POST',
            data: {pdata: JSON.stringify(post_data)},
            dataType: 'json'
        })
        .done(function(data) {});
    }

    /**
     * チャットワークのcontctsAPIを叩く
     *
     * APIを使わない方式に変更して不要となったのでAPI_TOKENを空にしている(ソース上にAPI_TOKENがあるのが嫌だったため)
     * 今後のChatworkの変更で、またAPIが必要となる場合を見越し一応メソッドは残しておく
     *
     * ユーザー名(本名)を取得するために使用
     *
     * @return array contacts コンタクト一覧
     */
    function getContacts() {
        var API_TOKEN = ""; // お仕事泥棒のAPI_TOKEN
        jQuery.ajax({
            url: 'https://api.chatwork.com/v2/contacts/',
            headers: {
            'X-ChatWorkToken': API_TOKEN
            },
            type: 'GET',
            json: true
        }).done(function (data, status, xhr) {
            if (xhr.status === 200) {
                // contacts一覧を返す
                localStorage.setItem('contacts', JSON.stringify(data));
                return data;
            } else {
                // 例外処理
            }
            return true;
        }).fail(function (data, status, xhr) {
            // エラー時の処理
            return false;
        }).always(function () {
            return true;
        });
    }
}

