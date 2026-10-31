export const FIXTURES = {
  "stance": {
    "schema": "npc-decision-input-r2b/1",
    "mode": "stance",
    "setting": "架空斗气修炼世界，少年家族生活阶段。原设定和已经发生的沙盒事件共同组成当前历史。",
    "scene_time": "1月16日，一场私人交流结束后",
    "actors": {
      "A": {
        "profile_id": "P_A",
        "profile": "家族旁系少年，曾多次帮助B、C；三人之间有亲近的友情。",
        "role_in_event": "即将实施日常互动的人物"
      },
      "B": {
        "profile_id": "P_B",
        "profile": "少女，外在礼貌沉静、观察细致，拥有自己的家族责任与私人目标；长期对C怀有明确感情，也珍惜与A建立的友情。",
        "current_priorities": [
          "关心C的成长及安危",
          "处理自己的日常责任"
        ],
        "relation_with_A": {
          "affection": 66,
          "trust": 66,
          "label": "挚友"
        },
        "known_fact_ids": [
          "F1",
          "F2",
          "F3",
          "F4"
        ]
      },
      "C": {
        "profile_id": "P_C",
        "profile": "少年，曾遭遇重大挫折，重视自尊、家人与修炼目标；珍惜A在困难时期的帮助，在意与B之间的亲近关系。",
        "current_priorities": [
          "努力恢复实力",
          "为重要约定作准备"
        ],
        "relation_with_A": {
          "affection": 72,
          "trust": 70,
          "label": "挚友"
        },
        "known_fact_ids": [
          "F1",
          "F2",
          "F3",
          "F4"
        ]
      }
    },
    "facts": [
      {
        "id": "F1",
        "type": "confirmed",
        "content": "A曾在测验日与其他公开冲突中维护C，也帮助C疗伤和练功；B见证了部分互动。三人有持续一段时间的共同生活与相处经历。"
      },
      {
        "id": "F2",
        "type": "confirmed",
        "content": "1月16日，A向B表达过超出普通朋友的好感，提出一次不带C的单独出行邀约。B明确拒绝，并说明自己对C的感情。C在场。"
      },
      {
        "id": "F3",
        "type": "confirmed",
        "content": "A听到拒绝后表示接受并祝福B和C。三人没有因此结束友谊。"
      },
      {
        "id": "F4",
        "type": "confirmed",
        "content": "截至当前，三人仍然正常相处，尚未形成关于未来几天相处方式的具体新约定；之后的具体事件还没有发生。"
      }
    ],
    "prospective_input": {
      "actor": "A",
      "content": "接下来几天继续与B、C正常相处，在日常小事上对B多关照一些，含蓄表达好感；暂不再次表白，也不刻意排除C。",
      "visibility": "这只是即将执行的玩家行动意图。B和C尚未观察到未来几天任何具体行为，不能据此提前认定人物已知事实。",
      "detail_status": "尚未生成；之后的对话、送礼、照顾、冲突、回应均未确定。"
    },
    "task": {
      "target_actor_ids": [
        "B",
        "C"
      ],
      "time_horizon": "即将到来的数日互动，生成前",
      "request": "给出人物当前立场、尚未确认事项、自己的议程及未来可观察条件下的反应倾向。不决定尚未发生的事件或最终关系变化。"
    }
  },
  "decision": {
    "schema": "npc-decision-input-r2b/1",
    "mode": "decision",
    "setting": "架空斗气修炼世界，家族少年的后山日常。这是具体事件的单元测试，不代表以后每次送食物都要调用模型。",
    "scene_time": "1月19日，后山相聚时",
    "actors": {
      "A": {
        "profile_id": "P_A",
        "profile": "家族旁系少年，与B、C是亲近朋友，此前向B表达过特殊好感。",
        "role_in_event": "准备食物、主动照顾的参与者"
      },
      "B": {
        "profile_id": "P_B",
        "profile": "少女，礼貌沉静、观察细致，有自己的家族责任；长期对C怀有明确感情，同时认可A的友情与过去帮助。",
        "current_priorities": [
          "自己的日常安排",
          "关心C的近况"
        ],
        "relation_with_A": {
          "affection": 66,
          "trust": 66,
          "label": "挚友"
        },
        "known_fact_ids": [
          "F1",
          "F2",
          "F3",
          "E1",
          "E2"
        ]
      },
      "C": {
        "profile_id": "P_C",
        "profile": "少年，重视尊严与修炼，珍惜A的帮助与友情，在意与B的亲近关系。",
        "current_priorities": [
          "训练，提高实力",
          "维护重要关系"
        ],
        "relation_with_A": {
          "affection": 72,
          "trust": 70,
          "label": "挚友"
        },
        "known_fact_ids": [
          "F1",
          "F2",
          "F3",
          "E3"
        ]
      }
    },
    "facts": [
      {
        "id": "F1",
        "type": "confirmed",
        "content": "A曾在困难时期多次帮助C；三人有共同相处经历。"
      },
      {
        "id": "F2",
        "type": "confirmed",
        "content": "1月16日，A向B表达过超出普通朋友的好感，提出不带C的单独出行；B明确拒绝，并表达对C的感情。C在场。"
      },
      {
        "id": "F3",
        "type": "confirmed",
        "content": "A表示接受结果，三人继续作为朋友相处。"
      },
      {
        "id": "E1",
        "type": "B_observed",
        "content": "A搬动石板，为B挡住身后的寒风。"
      },
      {
        "id": "E2",
        "type": "B_observed",
        "content": "A带来两包温热的糖炒栗子：红线包装放在B手边，麻绳包装放在C放衣服的石凳上。A向B说明红线那包特意挑掉焦黑并多淋桂花蜜，麻绳那包较大、管饱。B听到了这段说明，尚未回应。"
      },
      {
        "id": "E3",
        "type": "C_observed",
        "content": "C结束练习回到石桌旁，看见B手边红线包装，以及给自己准备的麻绳包装。材料没有证明C听见了两包处理差异的口头说明。尚未回应。"
      }
    ],
    "task": {
      "target_actor_ids": [
        "B",
        "C"
      ],
      "request": "分别给出对当前可知事件的理解、未确认之处、自己当前的优先事项，并各自选定一个当前准备采取的具体行动。不要代写他人的后续回应或保证关系变化。"
    }
  }
};
